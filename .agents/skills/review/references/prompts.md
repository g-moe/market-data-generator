# Prompts

Subagent prompts decide review quality. Each template is copy-adapt, not copy-paste.
Fill in every `{placeholder}` before spawning.

## Parent prompt template

Use `subagent_type: generalPurpose` with `readonly: true`. Parent spawns its own 4 children, then synthesizes.

```txt
You are Parent {N}/{4} in a review swarm.

Review target:
- {target}  (paths, diff range, PR URL, or design doc)

Rubric for this review (from main agent):
- R1. {rubric item 1}
- R2. {rubric item 2}
- ... (8–16 items total)

Your assigned lens:
- {lens name}
- {one-line lens definition}

Your framing (distinct from sibling parents):
- {target-surface partition and failure-class focus for this parent; must
  not be a lens-label rename of another parent's framing}

Rubric items owned by your lens:
- {R-numbers for this parent, 2–8 items; overlap with sibling parents is
  allowed for rubric items that naturally span lenses}

Pair with skills: {names, e.g. convex, vitest, skill-author}

Your job:
1. Spawn 4 child subagents in parallel using the Task tool with
   subagent_type: explore, readonly: true.
2. Assign each child an ORTHOGONAL angle within your lens. Angles:
   - Child A: {angle A} → rubric items [{R-numbers}] → scope: {paths/hunks}
   - Child B: {angle B} → rubric items [{R-numbers}] → scope: {paths/hunks}
   - Child C: {angle C} → rubric items [{R-numbers}] → scope: {paths/hunks}
   - Child D: {angle D} → rubric items [{R-numbers}] → scope: {paths/hunks}
3. Fill the Child prompt template (see references/prompts.md § Child
   prompt template). Each child prompt MUST carry the full rubric, the
   child's owned rubric items, sibling-exclusion "do not cover" lines,
   the child's assigned scope slice, and the anti-hallucination rules.
4. Every child MUST run the draft-then-ground two-pass (see
   references/grounding.md). Include that instruction in each child prompt.
5. Collect the four child reports. If any child failed / timed out /
   returned empty, continue with the remaining reports, record
   `children_completed: [A,B,D]` in your summary, and surface the gap
   under "Key disagreements or uncertainty".
6. Run a SELF-VERIFICATION pass on EVERY CRITICAL / HIGH finding before
   including it. Ask "what would make this wrong?" Drop ones that flip;
   downgrade ones that weaken; record the verification trace on every
   surviving CRITICAL / HIGH as `Verified: {short note}`.
7. Produce ONE parent summary using the shape in references/report-format.md
   (merged findings, strongest conclusions, key disagreements or
   uncertainty, top takeaways). Dedupe; resolve or flag contradictions;
   rank by severity × confidence. Do NOT concatenate.

Rules:
- Read-only. No code edits.
- Every finding must cite file:line, carry severity
  (CRITICAL/HIGH/MEDIUM/LOW/INFO), carry confidence (high/medium/low),
  and reference the rubric item (Rn) it fails.
- Every CRITICAL / HIGH must carry a `Verified:` trace.
- Drop findings without evidence or downgrade to "needs follow-up".
- Ground repo claims in AGENTS.md and paired domain skills.
- Verify subagent-config claims (Task tool shapes, parameter names)
  against the ambient Task tool descriptor before promoting to a
  finding; children cannot see that descriptor.

Return only the parent summary.
```

## Child prompt template

Use `subagent_type: explore`, `readonly: true`. Specify thoroughness.

```txt
You are Child {A|B|C|D} for Parent {N} ({lens}) in a review swarm.

Review target:
- {target}  (paths, diff range, PR URL, or design doc)

Your assigned scope:
- paths: {one or more concrete paths or globs inside the target}
- diff hunks: {hunk ranges when reviewing a diff; omit otherwise}

Full rubric:
- R1. {rubric item 1}
- R2. {rubric item 2}
- ... (8–16 items total)

Rubric items owned by your angle:
- {2–3 R-numbers}

Your angle:
- {angle name}
- {one-paragraph angle definition — what to look for, what "good" means}

Do NOT cover (owned by siblings):
- {sibling A angle, one line}
- {sibling B angle, one line}
- {sibling C angle, one line}

Pair with skills: {names, e.g. convex, vitest, skill-author}

Thoroughness: {quick | medium | very thorough}

Two-pass approach (draft-then-ground):

Pass 1 — DRAFT:
- Read your assigned paths / hunks.
- Form candidate findings as hypotheses: "I think X is wrong because Y,
  violating Rn."
- Do NOT commit severity or confidence yet.

Pass 2 — GROUND:
For each hypothesis, run at least ONE of:
- Read the cited function or type end-to-end; the diff alone is insufficient.
- Read at least one caller or consumer.
- Check the nearest test file for coverage; note gaps.
- Grep the repo for the pattern to see prior art.
- Read the matching repo skill section.
- For type / schema claims (zod ↔ Convex validator ↔ consumer type):
  read all three sites; mismatch between any pair is grounding-worthy.

Drop hypotheses that flip. Downgrade incomplete groundings to
confidence: low, bucket "needs follow-up". Use the downgrade-or-drop
decision rule in references/grounding.md.

Required report shape (see references/report-format.md):
- scope: files read, callers consulted, tests consulted
- findings: each with severity, confidence, file:line, rubric item,
  reasoning, grounding check that passed, suggested action
- uncertainties: open questions, dropped hypotheses, outside-angle
  observations

Rules:
- Read-only. No edits.
- Cite file:line for every finding. No invented line numbers.
- Quote exact fragments, not paraphrases; no paraphrase treated as a quote.
- No invented APIs, imports, or symbols. If unsure a symbol exists,
  grep first or downgrade confidence.
- No "usually" / "typically" claims unrooted in the current repo.
- No cross-module claims without reading both sides.
- No rubric-item citation unless the item maps to the defect.
- Every finding references the rubric item it fails (Rn).
- Drop findings without evidence or without a surviving grounding check.
- Stay inside your angle. Out-of-angle observations go under
  "uncertainties", not findings.
- Use repo domain skills (convex, sveltekit, ui, coding, vitest,
  auth-cognito) when target touches those areas. When target is a skill
  file under `.agents/skills/**`, also pair with skill-author.
```

## Final synthesis prompt (main agent to itself)

After all parent summaries return, run this structure mentally or explicitly.

```txt
Inputs:
- Up to 4 parent summaries (Correctness, Risk, Practicality, Strategy)
  — or whichever lens set was chosen. If a parent failed or returned
  empty, mark its owned rubric items `not-checked (parent failed)` and
  surface the gap in the executive summary.
- The rubric used by the swarm.

Steps:
1. Extract every finding with its severity, confidence, lens, rubric
   item, file:line, and (for CRITICAL / HIGH) `Verified:` trace.
2. Reject any CRITICAL / HIGH that lacks a `Verified:` trace. Send back
   to the owning parent for verification; do NOT promote to Must-fix
   without it. If re-verification is not possible this turn, downgrade
   to MEDIUM and record the missing trace in Explicit uncertainty.
3. Deduplicate across lenses. Same file:line + same defect = one finding.
   Keep the strongest evidence. Note when multiple lenses flagged it.
4. Reconcile contradictions: prefer the finding with stronger evidence,
   or keep both and flag under "Key disagreements".
5. Rank by severity × confidence.
6. Bucket: must-fix (CRITICAL/HIGH), should-fix (MEDIUM), nice-to-fix
   (LOW), open questions.
7. Attach rubric check-list: pass / fail / not-checked per item, with
   the failing finding referenced. Compliance items (pass) live ONLY in
   the check-list; do not emit them as severity-labelled findings.
8. Write ≤5-line executive summary at the top.
9. Emit report in the format in references/report-format.md.
```

## Prompt hygiene rules

- One target per swarm. Do not mix a PR review and a separate refactor audit.
- Non-overlap boundaries are explicit in every child prompt, not implied.
- Thoroughness label must match the target size. A "very thorough" label on a 30-line diff wastes tokens.
- Each prompt names the specific repo skills that apply (e.g. "pair with skills `convex` and `vitest`"). Do not rely on the child to guess.
- Children must not see each other's prompts or outputs.
- Parents do not edit child outputs inline; parents produce a new, merged summary.
- Repo-rooted paths: when subagent CWD is not the repo root, rewrite template `references/...` paths to repo-rooted form before sending.
- Filler words (`just`, `really`, `basically`, `actually`, `simply`) are disallowed in prompts and reports; root `AGENTS.md` rules apply.
- The draft-then-ground specification is canonical in [grounding.md](./grounding.md). Include its Pass 1 / Pass 2 instructions verbatim in child prompts and cross-reference rather than restating it.

## Example fidelity rule

The filled-in parent and child examples below are **strict fills** of the templates above. If you edit a template, also edit the examples. If the examples drift, they stop being templates and become anti-examples.

## Example: filled-in parent prompt (Correctness over a Convex API change)

```txt
You are Parent 1/4 in a review swarm.

Review target:
- Diff: packages/convex/convex-backend/src/convex/ticketApi/api_ticketApi.ts
- Related: packages/convex/convex-backend/src/convex/ticketApi/_shared/*
- Parity: packages/convex/convex-backend/src/shared/**

Rubric for this review:
- R1. Public args schema is zod-derived; Convex validators match.
- R2. Return schema matches actual handler payload.
- R3. `prepare` owns auth, permissions, and audit wiring.
- R4. Public handler has no side effects not captured in audit.
- R5. Rate-limit strategy matches action cost.
- R6. No raw `query` / `mutation` / `action` outside approved exceptions.
- R7. Tests cover happy path, auth denial, and at least one failure branch.
- R8. No migration looseness inside zod; temp looseness only in `defineTable(...)`.

Your assigned lens:
- Correctness & Rigor
- Logic truth, invariants, schema parity, edge cases, type truth.

Your framing (distinct from sibling parents):
- Partition: args / returns schema surfaces + handler control flow
  + caller type inference sites. Failure-class focus: type-level and
  runtime drift. Sibling parents own risk (authz / audit / rate-limit
  failure modes), practicality (tests / naming / doc drift), and
  strategy (API versioning / consumer impact).

Rubric items owned by your lens: [R1, R2, R6, R8]

Pair with skills: convex, coding, vitest.

Your job:
1. Spawn 4 child subagents in parallel using the Task tool with
   subagent_type: explore, readonly: true.
2. Assign each child an ORTHOGONAL angle within your lens. Angles:
   - Child A: zod ↔ Convex validator parity → [R1, R2] → scope:
     api_ticketApi.ts args/returns + _shared/schemas.
   - Child B: handler control flow and guard clauses → [R6] → scope:
     api_ticketApi.ts handler bodies.
   - Child C: side effects (DB writes, audit, scheduled hops) → [R4
     verify only] → scope: api_ticketApi.ts + ticketApi/_shared/*.
   - Child D: return contract vs caller callsites → [R2, R8] → scope:
     api_ticketApi.ts returns + grep of callers under apps/**.
3. Fill the Child prompt template. Each child prompt MUST carry the
   full rubric, the child's owned rubric items, sibling-exclusion
   "do not cover" lines, the child's assigned scope slice, and the
   anti-hallucination rules.
4. Every child MUST run the draft-then-ground two-pass (see
   references/grounding.md). Include that instruction in each child
   prompt.
5. Collect the four child reports. If any child failed / timed out /
   returned empty, continue with the remaining, record
   `children_completed: [...]`, and surface the gap under "Key
   disagreements or uncertainty".
6. Run a SELF-VERIFICATION pass on EVERY CRITICAL / HIGH finding before
   including it. Record the verification trace on every surviving
   CRITICAL / HIGH as `Verified: {short note}`.
7. Produce ONE parent summary using the shape in
   references/report-format.md. Dedupe; resolve or flag contradictions;
   rank by severity × confidence. Do NOT concatenate.

Rules:
- Read-only. No code edits.
- Every finding must cite file:line, carry severity and confidence, and
  reference the rubric item (Rn) it fails.
- Every CRITICAL / HIGH must carry a `Verified:` trace.
- Verify subagent-config claims against the ambient Task tool
  descriptor before promoting to findings.

Return only the parent summary.
```

## Example: filled-in child prompt (Child A under Correctness)

```txt
You are Child A for Parent 1 (Correctness) in a review swarm.

Review target:
- Diff: packages/convex/convex-backend/src/convex/ticketApi/api_ticketApi.ts

Your assigned scope:
- paths: packages/convex/convex-backend/src/convex/ticketApi/api_ticketApi.ts,
  packages/convex/convex-backend/src/convex/ticketApi/_shared/schemas/**,
  packages/convex/convex-backend/src/shared/**
- diff hunks: all args / returns declarations in api_ticketApi.ts

Full rubric:
- R1. Public args schema is zod-derived; Convex validators match.
- R2. Return schema matches actual handler payload.
- R3. `prepare` owns auth, permissions, and audit wiring.
- R4. Public handler has no side effects not captured in audit.
- R5. Rate-limit strategy matches action cost.
- R6. No raw `query` / `mutation` / `action` outside approved exceptions.
- R7. Tests cover happy path, auth denial, and at least one failure branch.
- R8. No migration looseness inside zod; temp looseness only in `defineTable(...)`.

Rubric items owned by your angle: [R1, R2]

Your angle:
- Schema parity.
- For every args / returns definition, confirm zod schema matches
  the generated Convex validator and the TypeScript type flowing into
  the handler. Flag drift, optional vs required mismatches, enum
  members, and missing zod entries.

Do NOT cover (owned by siblings):
- Child B: handler control flow and guard clauses.
- Child C: side effects (DB writes, audit, scheduled hops).
- Child D: return contract at caller sites.

Pair with skills: convex, coding.

Thoroughness: medium.

Two-pass approach (draft-then-ground):

Pass 1 — DRAFT:
- Read your assigned paths and hunks.
- Form candidate findings as hypotheses: "I think X is wrong because Y,
  violating Rn."
- Do NOT commit severity or confidence yet.

Pass 2 — GROUND:
For each hypothesis, ground by reading the shared schema file, the
derived validator, and one consumer type inference site (this is the
type/schema triad from grounding.md § Pass 2). Drop if grounding flips;
downgrade to low if grounding is incomplete. Apply the downgrade-or-drop
decision rule in references/grounding.md.

Required report shape (see references/report-format.md).

Rules:
- Read-only. No edits.
- Cite file:line. No invented line numbers.
- Quote exact fragments; no paraphrase treated as a quote.
- No invented APIs, imports, or symbols.
- No "usually" / "typically" claims unrooted in this repo.
- No cross-module claims without reading both sides.
- No rubric-item citation unless the item maps to the defect.
```
