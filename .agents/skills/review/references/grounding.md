# Grounding

How to produce substantive, evidence-bound reviews that resist superficial or hallucinated output.
This file supplies three patterns the baseline swarm lacks: **rubrics**, **draft-then-ground**, and **self-verification**.

## Research anchors

- **Rubric + grounding**: LLM reviewers without explicit rubrics and without tool-integrated evidence produce shallow, formulaic feedback. Rubric-guided, tool-integrated multi-agent setups outperform much larger single models on review quality. See [ReviewGrounder, arXiv 2604.14261](https://arxiv.org/abs/2604.14261).
- **Chain-of-Verification**: models that generate their own verification questions and answer them produce fewer hallucinated claims on grounded tasks. See [Chain-of-Verification, arXiv 2309.11495](https://arxiv.org/abs/2309.11495).
- **Self-Refine / Reflexion**: one self-critique pass raises output quality more cheaply than a second full generation pass. See [Self-Refine, arXiv 2303.17651](https://arxiv.org/abs/2303.17651).
- **Multi-Agent Debate**: diverse critiquing agents + explicit synthesis converge above single-agent chains. The swarm already uses lens diversity for this reason. See [Multi-Agent Debate, arXiv 2305.14325](https://arxiv.org/abs/2305.14325).

Takeaway for this skill: lens diversity and staged synthesis (what we already do) capture the Multi-Agent Debate gains. Rubric, draft-then-ground, and self-verification close the remaining gap toward substantive, non-formulaic reviews.

## Target rubric derivation

A rubric names what "good" looks like for THIS target. 8–16 short, verifiable yes/no items.

### Derivation recipe

1. Read the user goal and constraints from Step 1.
2. For each repo skill that touches the area (`convex`, `sveltekit`, `svelte`, `ui`, `coding`, `vitest`, `auth-cognito`; `skill-author` when the target is a skill; `documenter` when the target is docs or comments): extract candidate checks from Core rules, Best-practices, and Anti-patterns.
3. Inventory sibling files in the target's package or folder: note repeated patterns, naming, wrapper usage, and test conventions. Each repeated pattern is a candidate item.
4. Convert each candidate into a **yes/no, single-surface** statement: one sentence, one concrete surface, verifiable by reading specific code or running a specific check.
5. Dedupe items that collapse to the same check. Merge near-dupes.
6. Number the surviving items `R1…Rn` in a stable order (structural → behavioral → strategic).

### Sizing

- Target 8–16 items for medium targets.
- If the target exposes fewer than eight distinct surfaces (small component, short migration, skill file), widen scope to direct callers and tests. If the widened scope still yields fewer than eight, collapse to 4–7 items and record _why_ in the rubric header. Do not pad.
- If the target exposes more than 16 surfaces cleanly, split into two swarms or raise to ~20 items with a sibling pointer to the partition map.

### Each rubric item

- one sentence
- verifiable by reading specific code or running a specific check
- names a concrete surface (file, function, wrapper, env key, schema, test file, SKILL.md section)

### Example: Convex API rubric

```txt
R1. Public args schema is zod-derived; Convex validators match.
R2. Return schema matches actual handler payload.
R3. `prepare` owns auth, permissions, and audit wiring.
R4. Public handler has no side effects not captured in audit.
R5. Rate-limit strategy matches action cost.
R6. No raw `query` / `mutation` / `action` outside approved exceptions.
R7. Tests cover happy path, auth denial, and at least one failure branch.
R8. No migration looseness inside zod; temp looseness only in `defineTable(...)`.
```

### Example: SvelteKit route rubric

```txt
R1. Server-only secrets stay in `+page.server.ts` / `+layout.server.ts`.
R2. `load` returns typed data; no secrets leaked to client payload.
R3. Form actions use progressive enhancement and typed action returns.
R4. `$env/static/private` vs `$env/dynamic/public` used correctly.
R5. Parent layout data use is explicit; no hidden cross-layer coupling.
R6. Error paths surface via `error()` or structured action errors.
R7. Prerender / SSR decisions match deploy target (Amplify adapter).
R8. Hooks do not block hot paths; cookies handled via `cookies` helper.
```

### Example: skill self-review rubric (pair with `skill-author`)

```txt
R1. Frontmatter `description` covers target triggers with distinct quoted phrases.
R2. Skill name is one word, matches folder, under 72 characters.
R3. SKILL.md section order matches the skill-author template (Overview → Core rules → References → Process → Best-practices → Anti-patterns).
R4. References table rows each point to a real local path or https URL.
R5. SKILL.md under 325 lines; target 200.
R6. Core rules are 3–10 bullets; non-contradictory across the file set.
R7. Process steps are sequenced with named deliverables / handoffs.
R8. Best-practices use `Key-points:` / `Why this is good:` structure.
R9. Anti-patterns are 3–8 bullets specific to failure modes of this skill.
R10. No conflict with root `AGENTS.md`; no claims unsourced to repo config, CI, or a repeated pattern.
```

The rubric travels with the swarm. Every child prompt carries the rubric. Every finding cites the rubric item it fails.

## Draft-then-ground (child workflow)

Each child runs **two passes inside its single turn**.

### Pass 1: Draft hypotheses

- Read assigned files and diff hunks.
- Form candidate findings as hypotheses: "I think X is wrong because Y, violating rubric item Rn."
- Do not commit severity or confidence yet.
- Keep rejected hypotheses in an internal list for the final "uncertainties" section.

### Pass 2: Ground each hypothesis

For each hypothesis, run at least one grounding check:

- Read the cited function or type end-to-end; do not stop at the diff.
- Read at least one caller or consumer.
- Check the nearest test file for coverage of the path; if missing, note the coverage gap.
- Grep the repo for the pattern to see prior art and convention drift.
- Read the matching repo skill section if the hypothesis touches a skill-covered area.
- For type / schema claims: read the zod schema, the derived Convex validator, and one consumer type inference site.

### Downgrade-or-drop decision rule

- **Drop** — grounding produced direct counter-evidence (wrapper injects missing value, convention exists, finding was a rubric stretch).
- **Downgrade one step** — grounding produced partial doubt without counter-evidence (couldn't find a caller, test absent but not pathological, rubric item weakly mapped).
- **Keep at stated confidence** — grounding produced corroborating evidence (caller confirms risk, test missing where it's the obvious failure path, prior-art grep shows repeated correct pattern elsewhere).

### Result

Only grounded hypotheses become findings. Each finding records:

- the rubric item it fails
- the grounding check that survived (one line)
- the `file:line` evidence

## Self-verification (parent workflow)

Before a parent commits its CRITICAL / HIGH findings, it MUST run one verification round per finding.

Ask:

- "What would make this finding wrong?"
- "Is there a repo-specific context — wrapper, convention, allowed exception, migration window — that excuses this pattern?"
- "Am I citing a real line the child read, or a paraphrase?"
- "Does the rubric item cover this, or am I stretching?"

If the finding **flips**: drop it and record the counter-evidence in "Key disagreements or uncertainty". If it **weakens**: downgrade one severity step and record the doubt. Otherwise, record the verification note as `Verified: {one-line note}` on the finding. The `Verified:` field is required on every surviving CRITICAL / HIGH at the parent stage; final synthesis must reject any that lacks it.

Verification is one pass, not many. More than one round on the same finding is diminishing returns and often introduces doubt that the evidence does not warrant.

## Anti-hallucination rules

- **No invented line numbers.** Cite only lines the child read.
- **No paraphrased code treated as a quote.** Quote exact fragments, or describe paraphrase explicitly.
- **No invented APIs or imports.** If unsure a symbol exists, grep first or downgrade confidence.
- **No "usually" / "typically" claims** unrooted in the current repo.
- **No cross-module claims** without reading both sides.
- **No rubric-item citation** unless the item maps to the defect.

These rules are binding on children (carry into every child prompt — see [prompts.md](./prompts.md)) and on parents (re-check during self-verification).

## Evidence retrieval quick menu

When a child needs grounding evidence fast:

- **Caller discovery**: grep the symbol name repo-wide; read top 1–3 callers.
- **Test coverage**: grep for test files next to the changed file; note absence.
- **Convention check**: grep for the pattern across the same package; flag drift.
- **Skill alignment**: read the matching repo skill (e.g., `convex` custom-api or schema reference).
- **Prior art**: git log / blame-adjacent files for prior design decisions.
- **Type / schema parity**: read the zod schema, the derived validator, and one consumer type inference site.
- **Error copy quality**: grep for the error string or code to see how other surfaces phrase it.

## Calibrated uncertainty

Confidence labels must reflect evidence depth, not author conviction.

- `high` — direct citation + at least one grounding check passed.
- `medium` — direct citation, grounding incomplete.
- `low` — hypothesis that could not be grounded; file under "needs follow-up".

Findings without any citation **do not get emitted**. Findings with `low` confidence go into "Nice-to-fix / open questions", never "Must-fix".

## When to skip grounding

Grounding has a cost. Skip or abbreviate when:

- the target is under 50 lines and all context is in the diff
- the finding is purely about readability or naming
- the user explicitly asked for a quick pass

In a quick pass, still carry the rubric and cite `file:line`. Drop only the two-pass structure, not the evidence discipline.

## Token-budget note

A full 4×4 swarm with a 16-item rubric and a medium-sized target is not cheap. Before spawning, confirm size-class matches swarm shape (see `SKILL.md § Right-size the swarm`). For tiny targets or meta-targets (skills, docs), 2×2 or single-agent beats a padded 4×4.
