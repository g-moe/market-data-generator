# Report Format

Three report shapes: **child report**, **parent summary**, **final executive review**.
Each stage synthesizes the previous, never concatenates.

## Field mapping across stages

Field names stay consistent across stages. When a stage summarizes, it keeps the same name, not a rename.

| Child report | Parent summary | Final executive review |
| ------------ | -------------- | ---------------------- |
| Location | Location | `path:line` in finding heading |
| Reasoning | Reasoning | Why |
| Evidence | Grounding | (elided; Why carries the gist) |
| Grounding check | Grounding | (elided; Why carries the gist) |
| Confidence | Confidence | Confidence |
| Severity (heading) | Severity (heading) | Severity (heading) |
| Rubric item (`[Rn]`) | Rubric item | Rubric item |
| — | **Verified** (required on CRITICAL / HIGH) | **Verified** (required on Must-fix) |
| Suggested action | Suggested action | Action |

A compliance check that *passes* lives only in the rubric check-list at the final stage. It never becomes a severity-labelled finding.

## Severity and confidence vocabulary

Use these labels consistently across all stages.

- **Severity**
  - `CRITICAL` — data loss, security breach, production outage path, or broken core contract.
  - `HIGH` — correctness bug with user-visible impact, or a risk that is likely to trigger.
  - `MEDIUM` — defect with limited blast radius, or clear design issue worth fixing.
  - `LOW` — readability, small maintainability concern, minor inconsistency.
  - `INFO` — observation, not a defect.

- **Confidence** (tied to grounding evidence, not author conviction)
  - `high` — direct citation plus at least one grounding check (caller, test, skill, prior art) passed.
  - `medium` — direct citation, grounding incomplete.
  - `low` — hypothesis that could not be grounded; file under "needs follow-up".

Findings with no citation get dropped. Findings with `low` confidence go in "Nice-to-fix / open questions", never "Must-fix".

Every finding anchors to a rubric item (`Rn`) from the swarm rubric (derivation recipe in [grounding.md](./grounding.md)). Findings that cannot anchor to any rubric item belong under uncertainties, not findings.

Every finding gets a stable number so follow-up discussion can refer to "finding F2" or "issue 3" without ambiguity. Child and parent stages number findings locally (`C1`, `C2` or `P1`, `P2`). Final executive reviews use one continuous `F1`, `F2`, ... sequence across all findings, without resetting inside Must-fix / Should-fix / Nice-to-fix buckets.

## Child report shape

Every child returns this shape. No prose walls.

```md
# Child {letter} report — Parent {N} ({lens})

## Scope
- files or diff hunks the child read
- grounding checks performed (callers read, tests checked, skills consulted)
- skipped areas with one-line reason

## Findings

### C1. [{SEVERITY}][{lens}] [R{n}] {short title}
- Location: `path/to/file.ts:LINE` (or hunk range)
- Reasoning: one or two lines tying code to defect
- Evidence: short exact quote from the cited line(s)
- Grounding check: one line naming the artifact type (caller / test / skill section / sibling file) and why it confirms the hypothesis
- Confidence: high|medium|low
- Suggested action: one specific change, not "consider refactoring"

### C2. [{SEVERITY}][{lens}] [R{n}] {next finding}
- ...

## Uncertainties
- open questions you could not answer from code alone
- dropped hypotheses (one line each: what you drafted, why grounding killed it)
- items you noticed outside your angle (do not turn into findings)
```

### Child report rules

- One finding per issue. Do not bundle unrelated defects.
- Number each finding locally as `C1`, `C2`, ... in heading order.
- Cite line numbers. `path/to/file.ts:42` or `path/to/file.ts:40-55`.
- Quote exact fragments, not paraphrases.
- Anchor every finding to a rubric item `Rn`.
- Record the grounding check that survived Pass 2, in one line.
- Stay inside assigned angle; park out-of-angle observations under Uncertainties.
- If no findings, still emit `## Findings\n_None._` and keep Scope, dropped-hypothesis list, and Uncertainties filled.

## Parent summary shape

Each parent merges its four children into one summary.

```md
# Parent {N} summary — {lens}

## Swarm completion
- children_completed: [A, B, C, D]  <!-- list only returned children -->
- children_failed: []  <!-- record any with one-line reason -->

## Rubric items owned
- R{n}, R{n}, ... (from the global rubric)

## Merged findings
List findings after dedupe, rank, and self-verification. Each item:

### P1. [{SEVERITY}][{lens}] [R{n}] {short title}
- Location: `path:line`
- Merged from: children [A, C]
- Reasoning: one line, strongest framing
- Grounding: one line naming the check that held
- Confidence: high|medium|low
- Verified: short note on what "would make this wrong" check produced  <!-- REQUIRED on CRITICAL / HIGH; omit for MEDIUM / LOW / INFO -->
- Suggested action: one specific change

## Strongest conclusions
- 3–5 bullets: what this lens is most confident about

## Key disagreements or uncertainty
- contradictions between children, with both sides
- CRITICAL / HIGH findings downgraded or dropped during self-verification
- any failed / timed-out / empty child and the coverage gap it creates

## Top takeaways
- 3 bullets max: what the main agent should carry forward
```

### Parent synthesis rules

- Merge: dedupe items with the same `path:line` + same defect class; keep strongest reasoning and evidence.
- Resolve contradictions: prefer the finding with stronger evidence; if tied, keep both and flag under "Key disagreements".
- **Self-verification is required**, not optional. Every CRITICAL / HIGH finding MUST carry a non-empty `Verified:` trace. Findings that flip during verification MUST be dropped; findings that weaken MUST be downgraded. See [grounding.md](./grounding.md).
- Rank within lens by severity × confidence.
- Number each merged finding locally as `P1`, `P2`, ... after dedupe.
- Do not carry child prose verbatim unless one line is already the best available phrasing.
- If the lens turned up nothing, say so in one line — do not pad.
- If a child failed / timed out / returned empty, record it under `children_failed` with a one-line reason and surface the gap under "Key disagreements or uncertainty".

## Final executive review shape

Main agent produces this from the parent summaries.

```md
# Review: {target}

## Executive summary
- ≤5 lines: what is good, what must change, headline risks
- include a one-line swarm-completeness note if any parent or child failed

## Must-fix (CRITICAL / HIGH)
F1. [{SEVERITY}] [R{n}] `path:line` — {title}
- Lenses: [correctness, risk]
- Confidence: high|medium|low
- Verified: one line tracing the parent's self-verification result  <!-- REQUIRED -->
- Why: one line
- Action: one specific change

F2. ...

## Should-fix (MEDIUM)
F3. [MEDIUM] [R{n}] `path:line` — {title}
- Lenses: [...]
- Confidence: high|medium|low
- Why / Action: one line each

## Nice-to-fix (LOW) and suggestions
F4. [LOW] [R{n}] `path:line` — {one line specific change} (confidence: {...})

F5. ...

## Rubric check-list
- R1. {item} — pass | fail (see finding F{n}) | not-checked (reason, e.g. "parent failed")
- R2. {item} — ...
- ...

## Risks and open questions
- known unknowns
- items that need reviewer decision
- items worth logging as follow-up work

## Explicit uncertainty
- areas the swarm could not verify from code alone
- assumptions that, if wrong, change the review
- any Must-fix downgraded this turn because a `Verified:` trace was missing
```

### Final synthesis rules

- Dedupe across lenses. Same `path:line` + same defect = one entry; list all lenses that flagged it.
- Rank by severity × confidence, then assign continuous `F1`, `F2`, ... numbers after dedupe and bucketing.
- Reject any CRITICAL / HIGH that lacks a `Verified:` trace; downgrade to MEDIUM and record the gap under Explicit uncertainty if re-verification is not possible this turn.
- Attach the rubric check-list; pass / fail / not-checked with reason. Compliance items (pass) live only here, not as findings.
- Keep prose short. Prefer bullets.
- Do not hide contradictions; surface them under Risks and open questions.
- Final report sits above every intermediate artifact. If the user wants the raw parent summaries, attach them below; do not lead with them.

## Example: merged finding in the final executive review

```md
### F1. [HIGH] [R3] `apps/support/src/routes/(logged-in)/tickets/[currentView]/[id]/+page.server.ts:58` — Missing authz on ticket fetch
- Lenses: [risk, correctness]
- Confidence: high
- Verified: "what would make this wrong?" → confirmed by reading the
  wrapper factory; no default authz is injected.
- Why: `load` calls `getTicketById(id)` without confirming caller role;
  the ticket API itself trusts the route for authz. Parent 2 Child A and
  Parent 1 Child C independently flagged this.
- Action: add caller-role guard in `load`, or move authz into the API
  prepare step.
```

The parent-stage version of the same finding carries the full field set from the parent template (`Location`, `Merged from`, `Reasoning`, `Grounding`, `Confidence`, `Verified`, `Suggested action`). The final-stage form above folds `Merged from` / `Reasoning` / `Grounding` into `Why` and `Lenses`, keeping `Confidence` / `Verified` / `Action` as separate lines.

## Anti-superficiality checklist

Each box names the **actor** (who runs the check) and the **rejection rule** (what to do on failure).

### Per finding (actor: child, before return; rechecked by parent before inclusion)

- [ ] Cites `file:line` for a line the author read. *Fail → drop finding.*
- [ ] Anchors to a rubric item `Rn` that maps to the defect. *Fail → drop.*
- [ ] Quotes exact code, no paraphrase. *Fail → rewrite quote or drop.*
- [ ] Has a grounding check recorded. The check must name the artifact type (caller, test, skill section, sibling file) and why it confirms the hypothesis. *Fail → move to uncertainties, not findings.*
- [ ] Has a specific suggested action, not "consider refactoring". *Fail → rewrite action or drop.*
- [ ] Confidence reflects evidence depth, not conviction. *Fail → downgrade one step.*
- [ ] Has a stable local finding number (`C*` or `P*`) or final finding number (`F*`). *Fail → add one before emitting.*
- [ ] Not a generic style nit without substantive impact. *Fail → drop.*

### Per parent summary (actor: parent, before return)

- [ ] Every CRITICAL / HIGH carries a non-empty `Verified:` trace. *Fail → downgrade to MEDIUM, add to "Key disagreements or uncertainty".*
- [ ] `children_completed` / `children_failed` is populated. *Fail → refuse to emit.*
- [ ] No invented APIs, imports, or symbols anywhere in the summary.

### Per final report (actor: main agent, before delivery)

- [ ] Report contains at least one substantive finding OR clearly states "no substantive findings".
- [ ] Rubric check-list is present and every item has `pass` / `fail` / `not-checked` with reason.
- [ ] Must-fix items are truly CRITICAL / HIGH (not MEDIUM dressed up) AND every Must-fix carries a `Verified:` trace. *Fail → downgrade and note under Explicit uncertainty.*
- [ ] Contradictions are surfaced, not hidden.
- [ ] Swarm completion is disclosed. Any failed or skipped parent / child is surfaced, and affected rubric items are marked `not-checked (parent/child failed)`.
- [ ] No invented APIs, imports, or symbols anywhere in the report.

## Deliverable rules

- Default delivery: one final report (shape above).
- If user asked for inline PR comments, translate must-fix and should-fix into per-file comments; attach executive summary and rubric check-list to the PR body.
- If user asked for fixes, do those in a separate turn after approval. Do not edit code during review.
- If the swarm produced nothing of value, say so plainly in the executive summary. Empty is better than padded.
