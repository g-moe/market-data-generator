---
name: review
description: >-
  Multi-agent code review skill for PRs, diffs, files, features, architecture, schemas,
  migrations, APIs, and designs. Uses read-only subagents, distinct review lenses, and
  synthesized findings with file-line evidence. Use when the user asks to "review this
  code", "review this PR", "code review", "review my diff", "review this change",
  "review this file", "review this function", "review this architecture", "review this
  schema", "review this migration", "review this API", "swarm review", "deep review",
  "sanity check this change", "audit this code", "security review", "performance
  review", "find bugs", "find risks", "check my PR", or "QA this change".
---

# Review

## Overview

Multi-agent review. Spawns parallel read-only subagents with non-overlapping lenses, then synthesizes at each level. Use when a one-pass read would miss blind spots, or when a change warrants deeper scrutiny than a single agent can give.

## Core rules

- Read-only by default. Do not edit code during a review. Fixes are a separate, later turn after user approves.
- Scope, size, and rubric **before** lenses. Capture target / goal / constraints / delivery / `tiny / medium / large` class, then derive an 8–16 item yes/no rubric for THIS target (generic lenses without a concrete rubric produce formulaic, low-signal findings). See [references/grounding.md § Target rubric derivation](./references/grounding.md).
- Default shape: **4 parents × 4 children** for medium targets; right-size down for tiny, up for large (canonical table in [references/lenses.md](./references/lenses.md)). Pick parent lenses from the menu; swap when review type demands it.
- Give each of the four parents a **substantively different framing** — distinct target-surface partition plus distinct failure-class focus — not a lens-label rename. Within each parent, pre-plan **4 orthogonal child angles** covering the target with minimal overlap.
- Each child MUST run a **draft-then-ground** two-pass: draft hypotheses, then ground each with callers / tests / related skills / prior art. Ungrounded hypotheses drop; partially grounded ones downgrade. Quick-pass conditions are in [references/grounding.md](./references/grounding.md).
- Each parent MUST run a **self-verification pass** on every CRITICAL / HIGH finding: "what would make this finding wrong?" Flips → drop. Weakens → downgrade. Record the verification trace in a required `Verified:` field.
- Subagent shape: parents `subagent_type: generalPurpose`, `readonly: true`; children `subagent_type: explore`, `readonly: true`. Spawn parents in parallel (one message, multiple Task calls); each parent spawns its children in parallel. When nested spawn is blocked, fall back to a single-agent pass and mark the lens `degraded`.
- Failure handling: when a child, parent, or spawn fails / times out / returns empty, ship the remaining artifact with the gap in `Key disagreements or uncertainty` and rubric items marked `not-checked (parent/child failed)`. Never silently omit.
- Every finding cites `file:line`, carries severity (`CRITICAL/HIGH/MEDIUM/LOW/INFO`) and confidence (`high/medium/low`), and references the rubric item it fails. At every synthesis stage, merge → dedupe → resolve contradictions → prioritize. Never concatenate.
- Ground in [root AGENTS.md](../../../AGENTS.md). Prefer standards from repo skills first (see sibling skills in `.agents/skills` directory, repo patterns second, and external docs only when the standard is still unclear.

## References

| Link                                                         | Use when                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [references/lenses.md](./references/lenses.md)               | Picking parent lenses and planning novel child angles by review type                |
| [references/grounding.md](./references/grounding.md)         | Deriving a target rubric, running draft-then-ground children, and self-verification |
| [references/prompts.md](./references/prompts.md)             | Writing subagent prompts for children, parents, and final synthesis                 |
| [references/report-format.md](./references/report-format.md) | Shaping child reports, parent summaries, and the final executive review             |
| [../coding/SKILL.md](../coding/SKILL.md)                     | Checking repo coding conventions during code reviews                                |

## Process

### Step 1: Scope the review (Main)

Capture before spawning:

- **target**: PR link, diff, file set, feature name, design doc, schema, migration, architecture slice
- **goal**: what matters most — correctness, safety, design fit, performance, all?
- **constraints**: depth budget, required or skipped lenses, repo area boundary
- **delivery**: single report, inline comments, GitHub PR review, etc.
- **size**: `tiny` (<50 LoC or a single function/component) / `medium` (one route, module, schema slice) / `large` (cross-package refactor, multi-feature PR, whole-subsystem review)

If any field is missing and matters, ask once.

### Step 2: Derive target rubric (Main)

Name what "good" looks like for THIS artifact, not "good code in general". Follow the numbered recipe in [references/grounding.md § Target rubric derivation](./references/grounding.md).

Produce 8–16 short, verifiable yes/no items. When the target exposes fewer than eight distinct surfaces, widen scope to callers/tests or collapse to 4–7 items and record why (do not pad).

Partition `R1…Rn` across the four parents. Within each parent, assign 2–3 items per child. Rubric-item overlap _across parents_ is expected (e.g. R11 may be touched by risk and practicality); overlap _between children of the same parent_ is a planning defect. Findings cite the rubric item they fail.

### Step 3: Pick parent lenses (Main)

Default set (good for almost any PR):

1. **Correctness & Rigor** — logic, invariants, schema parity, edge cases, type truth.
2. **Risk & Failure Modes** — security, data integrity, concurrency, error paths, migration safety.
3. **Practicality & Execution** — readability, testability, observability, complexity, naming, typos, doc drift.
4. **Strategy & Prioritization** — architectural fit, repo conventions, API design, consumer impact, scope creep.

Swap lenses when review type changes. See the full menu — security, performance, architecture, migration, test-suite, UI-only, env/secrets, dependency-upgrade, docs-drift, infra/deploy — in [references/lenses.md](./references/lenses.md).

### Step 4: Plan child angles (Main)

For each parent, pre-assign four **orthogonal** child angles. Angles slice by _failure class_, _data flow_, or _subsystem_ — not by "files 1–5, files 6–10". Overlap between children means the plan failed.

Write down, before spawning:

- target files or diff hunks per child (the `paths` / `diff hunks` that fill the child prompt's `Your assigned scope` block)
- rubric items each child owns
- explicit "do not cover X, Y, Z" exclusions that belong to siblings

Assemble parent and child prompts by filling the templates in [references/prompts.md](./references/prompts.md) with the Step 4 plan.

### Step 5: Spawn the swarm (Main → Parents → Children)

**Main**: spawn all 4 parents in one batched tool call (parallel Task invocations).

**Parent (each)**: spawn its 4 children in parallel.

- Parents: `subagent_type: generalPurpose`, `readonly: true`.
- Children: `subagent_type: explore`, `readonly: true`. Specify `"quick" | "medium" | "very thorough"` thoroughness in the prompt.
- Every child prompt carries the rubric, the assigned angle, rubric items owned, sibling-exclusion boundaries, and the assigned scope slice (paths / hunks).
- Every child runs a **draft-then-ground** two-pass. See [references/grounding.md](./references/grounding.md) and [references/prompts.md](./references/prompts.md).

### Step 6: Parent synthesis with self-verification (Parents)

Each parent, after its children return, produces one parent summary:

- merges findings; keeps strongest evidence on dupes
- flags contradictions with both sides
- ranks by severity × confidence within its lens
- MUST run a **self-verification pass** on every CRITICAL / HIGH finding — "what would make this finding wrong?" — dropping ones that flip, downgrading ones that weaken, and recording the `Verified:` trace on every surviving CRITICAL / HIGH
- if any child failed / timed out / returned empty, records the gap under "Key disagreements or uncertainty" and lists `children_completed: [A,B,D]` so main synthesis can surface it
- returns the shape in [references/report-format.md](./references/report-format.md)

### Step 7: Main synthesis and delivery

Main agent:

- merges 4 parent summaries into one executive review
- rejects any CRITICAL / HIGH lacking a `Verified:` trace (send back for verification; do not promote to Must-fix without it)
- dedupes across lenses (the same issue may surface twice)
- prioritizes must-fix → should-fix → nice-to-fix
- includes grounded typo findings for public names, user-facing copy, docs, config keys, and test names; keep nit-only typo findings as `LOW` or `INFO`
- marks rubric items owned by a failed parent as `not-checked (parent failed)` and surfaces the gap in the executive summary
- separates open questions and explicit uncertainty
- attaches the rubric with pass / fail / not-checked per item
- delivers in the format in [references/report-format.md](./references/report-format.md) (single report by default; translate to the user's requested delivery shape when different)

If user wants fixes applied, do that as a **follow-up turn** after they approve the review.

## Best-practices

### Orthogonal child angles

Key-points:

- Slice by failure class, data flow, or subsystem — not by file ranges.
- Pre-write "do not cover" exclusions for each child.
- Four angles per parent should collectively cover the target with minimal overlap.

Example (Correctness parent over a new Convex API route):

```txt
Child A: request validation — zod schema parity with Convex validator; reject shapes.
Child B: handler control flow — guards, early returns, happy path.
Child C: side effects — DB writes, audit log, scheduled actions, external calls.
Child D: return contract — response type truth, error codes, caller assumptions.
```

Why this is good:

- No child duplicates another's findings.
- Synthesis is short because dedupe work is rare.

### Evidence-bound findings

Key-points:

- Every finding cites `file:line` (or hunk).
- Every finding carries one-line reasoning and confidence (high/medium/low).
- No evidence means drop, or mark "needs follow-up" and downgrade confidence.

```txt
[HIGH][Correctness] packages/convex/convex-backend/src/convex/foo.ts:42
  Reason: handler returns `R.ok(user)` but zod return schema expects `{ user }`.
  Confidence: high.
  Suggested: wrap payload in `{ user }` or relax schema.
```

Why this is good:

- Fix authors jump straight to the spot.
- Forces children to ground claims instead of hand-waving.

### Right-size the swarm

Key-points:

- **Tiny** (single function, <50 LoC, or a small skill/docs file ≤200 lines): 2 parents × 2 children, or a single-agent review.
- **Medium** (one route, one component, one module, one schema slice): default 4 × 4.
- **Large** (cross-package refactor, multi-feature PR, whole-subsystem review — roughly >500 LoC diff or >N files across >M packages): 4 × 4 with broader parent swaths; beyond that, run sequential passes chunked by package (or by critical-dep edge) with an explicit remainder backlog.
- Size class is a Step 1 output, not an after-the-fact observation.
- Full thresholds and per-target-type notes (code, skill, docs, design) live in [references/lenses.md § Right-sizing](./references/lenses.md).

Why this is good:

- Avoids 16 agents for a 30-line change.
- Keeps throughput honest with actual review depth.
- Token budget stays predictable because spawn count is a function of target size, not habit.

### Rubric-guided reviewing

Key-points:

- Name what "good" looks like for THIS target before picking lenses or angles.
- 8–16 short, verifiable rubric items beats a page of abstract principles.
- Each child angle maps to 2–3 rubric items; findings cite the rubric item they fail.

Example rubric snippet (Convex API change):

```txt
R1. Public args schema is zod-derived; Convex validators match.
R3. `prepare` owns auth, permissions, and audit wiring.
R5. Rate-limit strategy matches action cost.
R7. Tests cover happy path, auth denial, and at least one failure branch.
```

Full rubric examples and derivation patterns: [references/grounding.md](./references/grounding.md).

Why this is good:

- Findings become rubric-item anchors plus evidence, not freeform opinion.
- Superficial / generic comments get filtered because they do not map to a rubric item.
- Rubric travels with the review, so the author can check items off after fixing.

### Draft-then-ground children

Key-points:

- Each child runs two passes inside its single turn: **draft hypotheses**, then **ground each hypothesis** with targeted evidence.
- Grounding reads callers, tests, related skills, and prior art; the diff alone is insufficient.
- Hypotheses that flip under grounding get dropped. Partially grounded hypotheses stay but drop to `low` confidence.

Why this is good:

- Directly fights the "shallow, formulaic" failure mode of LLM reviewers.
- Evidence accumulates _before_ commitment, so confidence labels stay honest.
- Catches convention drift that pure diff-reading misses.

## Anti-patterns

Avoid:

- Starting the swarm before scope, size, and rubric are fixed; or spawning children with vague prompts like "review this file".
- Editing code mid-review; review and fix are separate turns.
- Sharding by file ranges rather than by failure class / data flow; or letting two children of the same parent overlap.
- Concatenating child outputs into a parent summary, or skipping the parent self-verification pass on CRITICAL / HIGH findings.
- Findings without `file:line` evidence, severity, confidence, or rubric anchor — or with hallucinated line numbers, invented APIs, paraphrase-treated-as-quote, or `usually`/`typically` claims unrooted in this repo.
- "Consider refactoring" findings with no specific change proposed, and nit-only reports that surface zero substantive findings.
- Four parents running identical prompts with only a lens label swap instead of substantively different framing.
- Ignoring `coding` for repo-code reviews, skipping relevant domain skills (`convex`, `sveltekit`, `ui`, `vitest`, `auth-cognito`), or omitting `skill-author` when the target is itself a skill.
