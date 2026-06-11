# Lenses

Pick **4 parent lenses** and plan **4 orthogonal child angles** per parent.
Novel angles beat checklist coverage. Dupes between children mean the plan failed.

## Default parent lenses (PR / patch review)

Use this set unless the review type demands otherwise.

1. **Correctness & Rigor** — logic truth, invariants, schema parity, edge cases, types matching runtime.
2. **Risk & Failure Modes** — security, data integrity, concurrency, error paths, migration safety, secrets.
3. **Practicality & Execution** — readability, testability, observability, complexity, naming, doc drift.
4. **Strategy & Prioritization** — architectural fit, repo conventions, API design, consumer impact, scope creep.

## Alternate parent lens sets

Swap when review type is specialized. Always keep four; never merge two into one parent.

### Architecture / design review

1. **Architectural Fit** — layering, boundaries, coupling, package edges.
2. **Evolution & Flexibility** — reversibility, extensibility, lock-in risks.
3. **Consumer Impact** — API contract, migration path, rollout.
4. **Risks & Unknowns** — threat surface, capacity, operational cost.

### Security review

1. **Authn / Authz** — identity, session, role, caller-id boundaries.
2. **Input & Output Hygiene** — validation, sanitization, injection, XSS, SSRF.
3. **Secrets & Data** — secret handling, PII exposure, audit completeness.
4. **Abuse & Attack Paths** — rate limits, enumeration, side channels, replay.

### Performance review

1. **Algorithmic Complexity** — hot paths, N+1, data-size growth.
2. **IO & Network** — round trips, fan-out, caching, payload size.
3. **Rendering & Client** — reactivity cost, hydration, bundle size. _(Swap for **Concurrency & Scheduling** — worker pools, task ordering, backpressure — when the target is server-only.)_
4. **Measurement Gaps** — missing traces, missing metrics, missing load signals.

### Migration / schema review

1. **Forward Compatibility** — old readers vs new writers.
2. **Backward Compatibility** — new readers vs old writers.
3. **Data Safety** — partial failure, rollback, idempotence, ordering.
4. **Cleanup Path** — temp fields tracked, deprecation plan, removal window.

### Test-suite review

1. **Coverage Gaps** — untested branches, error paths, boundary inputs.
2. **Test Quality** — assertion strength, flake vectors, mocked vs real edges.
3. **Test Shape** — table-driven, runner reuse, naming by behavior.
4. **Environment Routing** — `node` / `jsdom` / `edge` / `integration` correctness, file-suffix discipline.

### UI-only review

1. **Accessibility & Semantics** — roles, labels, keyboard flow, contrast.
2. **Design-system Fidelity** — `@repo/ui`, Tailwind v4 tokens, Bits UI primitives, theme API use.
3. **State & Reactivity** — `$state` / `$derived` / `$props` / snippets discipline, prop ownership.
4. **Hydration & SSR** — server vs client boundary, hydration mismatch, island boundaries.

### Env / secrets review

1. **Boundary Correctness** — `$env/static/private` vs `$env/dynamic/public`; client leakage paths.
2. **Loader Contracts** — `pnpm run env --`, `.tradester-env`, `.envConfig.json` filters.
3. **Secret Handling** — SSM keys, rotation, fallback on missing values.
4. **Runtime Surfaces** — SvelteKit / Convex / Node / Discord bot / infra access paths.

### Dependency-upgrade review

1. **Breaking-change Surface** — API shape drift, removed exports, type narrowing.
2. **Transitive Risk** — peer-dep skew, overrides collisions, lockfile health.
3. **Behavioral Drift** — runtime changes not reflected in types.
4. **Rollback & Safety** — pinning strategy, changelog fidelity, test coverage on upgraded paths.

### Docs-drift review

1. **Router Integrity** — `specification.md` routes to live satellites; no orphan satellites.
2. **AGENTS.md Fidelity** — every rule traces to scripts / CI / trusted docs (tier 1–4).
3. **Doc-to-Code Parity** — commands, paths, and examples match the live repo.
4. **Visual Aids** — Mermaid diagrams respect Session C appetite; captions and repo-path links present.

### Infra / deploy review

1. **IaC Shape** — stacks, construct reuse, parameterization per environment.
2. **Secret & Identity Plumbing** — IAM scopes, KMS keys, pipeline identity.
3. **Runtime Topology** — regions, failover, cold-start, capacity.
4. **Release Path** — deploy order, rollback, migration-window compatibility.

## Novel child-angle catalog (pick and slice)

Use these when planning each parent's four children. Avoid "review all files A-E" sharding.

### Correctness angles

- request / input validation vs declared schema
- handler control flow and early-return guards
- side effects (DB writes, audit log, scheduled jobs, external calls)
- return / response contract truth (types vs payload vs caller expectations)
- state-machine transitions and invariants
- nullability, `undefined` vs missing, optional chaining boundaries
- type-level truth vs runtime shape (zod ↔ TS types ↔ Convex validator parity)

### Risk angles

- authn and authz at entry points; caller-id use
- secret handling and environment read paths
- race conditions, idempotence, partial-failure recovery
- retry and backoff; at-least-once vs at-most-once behavior
- migration safety: reader/writer skew, downtime window, rollback
- PII / audit gaps; logging sensitive values
- third-party failure modes (timeout, 4xx, 5xx, schema drift)

### Practicality angles

- naming and code structure vs repo conventions
- helper reuse vs duplication; opportunities to collapse
- test coverage of new branches; missing edge cases
- observability: logs, metrics, error surfaces, user-facing error copy
- doc drift (JSDoc, `@component`, nearby markdown vs actual behavior)
- dead code, commented-out blocks, leftover `console.debug`

### Strategy angles

- repo conventions (pair with `coding`, `convex`, `sveltekit`, `svelte`, `ui`, `vitest` skills)
- API design: naming, versioning, breaking-change surface
- package boundary discipline (no cross-workspace relative imports)
- consumer impact: who imports this, how many callers break
- scope discipline: change size vs stated goal

### UI / frontend-specific angles

- accessibility (semantic markup, ARIA, keyboard paths, contrast)
- i18n / copy tone, user-facing error messages
- theme-token and design-system fidelity (`@repo/ui`, Tailwind v4 tokens)
- state ownership (Svelte runes, props, snippets, stores)
- hydration, SSR vs CSR boundary correctness

### Convex-specific angles

- `apiFactory` / `apiHttpFactory` usage vs raw registration
- `prepare` owning auth/audit vs leaking into handler
- rate-limit strategy choice
- zod ↔ validator parity; no migration looseness in zod
- schema `defineTable` migration looseness + Linear ID tagging

### SvelteKit-specific angles

- server vs client boundary (`+page.server.ts` vs `+page.ts`)
- form actions and progressive enhancement
- load-function input and parent dependence
- `$env` usage correctness
- hooks / adapter-safe code

## Combining across sets

A cross-cutting target (e.g. a Convex migration that also touches UI and adds new env keys) is often covered best by mixing sets. Rules:

- Keep four parents total; never five. Pick one lens from each of 2–3 sets that overlap the target.
- Parents must still have a substantively distinct framing (per SKILL.md Core rules); a mixed-set lineup is not a license to duplicate.
- Record the lineup in the rubric header so the reader knows why lenses come from different sets.

Example: Convex migration + support app UI + new env keys →
`Correctness & Rigor` (default) · `Data Safety` (migration set) · `Accessibility & Semantics` (UI-only set) · `Boundary Correctness` (env set).

## Right-sizing (canonical thresholds)

This table is canonical. `SKILL.md § Right-size the swarm` links here.

| Size           | Trigger                                                                                                 | Swarm shape                                               | Notes                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Tiny**       | <50 LoC diff, single function, ≤200-line skill or doc file                                              | 2 parents × 2 children, or single-agent review            | Skip two-pass grounding for purely readability findings; keep rubric and file:line discipline.  |
| **Medium**     | one route, one component, one module, one schema slice, or ~50–500 LoC diff                             | default 4 × 4                                             | The common case.                                                                                |
| **Large**      | >500 LoC diff, cross-package refactor, multi-feature PR, whole-subsystem review, or >~15 distinct files | 4 × 4 with broader parent swaths                          | If one lens returns noise that can't merge cleanly, run a second pass scoped to that lens only. |
| **Very large** | >~1500 LoC diff or >3 package boundaries                                                                | sequential passes chunked by package or critical-dep edge | Budget the remainder as an explicit backlog; do not try to one-shot.                            |

Size class is named in Step 1 (see `SKILL.md`), not inferred after spawn.

## Planning checklist

Before spawning, confirm:

- [ ] Review type is named and lens set chosen (or documented mix across sets).
- [ ] Each parent owns a distinct lens and a substantively distinct framing (partition + failure-class focus), not a lens-label rename.
- [ ] Each parent has four pre-planned child angles.
- [ ] Child angles are orthogonal (failure class, data flow, or subsystem slice).
- [ ] Each child has an explicit "do not cover" list matching sibling angles.
- [ ] Each child has an assigned scope slice (paths / hunks) written down.
- [ ] Rubric items are partitioned across parents; per-child assignment is 2–3 items.
- [ ] Domain skills referenced where relevant (`convex`, `sveltekit`, `svelte`, `ui`, `coding`, `vitest`, `auth-cognito`; `skill-author` when target is a skill; `documenter` when target is docs or comments).
- [ ] Size class set in Step 1; swarm shape matches the Right-sizing table.
