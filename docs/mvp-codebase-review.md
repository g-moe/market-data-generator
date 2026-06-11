# MVP Codebase Review

Review target: entire MVP codebase for `market-data-generator`.

Review focus:

- Deterministic tick generation.
- Candle/bar aggregation from generated ticks.
- 20,000-bar standard history and 30-session 1-second price-level history.
- Sierra Chart sync, export validation, and merged output.
- Test, documentation, and operational readiness after MVP.

Review method:

- Used the repo `review` skill for a rubric-first full-codebase review.
- Spawned four parent review agents covering correctness, Sierra risk, execution/docs/tests, and architecture/performance.
- Parent agents reported degraded nested-child execution because child spawning was unavailable inside the agents.
- Ran local validation commands and isolated executable probes to harden findings.
- Used official Sierra Chart docs to refine the 500-volume hypothesis.

## Executive Summary

The MVP is in good shape from a baseline health perspective: unit tests, typecheck, build, coverage, knip, md-generation e2e, Sierra e2e, and direct oxlint all passed.

The substantive issues are semantic/data-contract issues, not basic build failures.

The most important defects are:

- Generated `5m` and `500v` rows can have invalid `bidVolume`/`askVolume` totals.
- `500v` likely failed against Sierra because our aggregator uses exact split semantics while Sierra may be using threshold/overshoot semantics unless `Split Data Records` is enabled and effective.
- Session logic is fixed UTC and should be described that way in docs and tests.
- Sierra sync does not prove that `data-in` or Sierra exports belong to the current run.
- Failed Sierra validation can leave partially published `data-out`.
- No-indicator Sierra exports produce an invalid trailing empty CSV column.

## Validation Commands Run

These passed:

```sh
pnpm test
pnpm run typecheck
pnpm run knip
pnpm run build
pnpm run coverage
pnpm run test:e2e:md-generation
pnpm run test:e2e:sierra
pnpm exec oxlint .
```

Observed results:

- Unit tests: 21 files, 101 tests passed.
- Coverage: 99.1% statements, 93.11% branches, 99.42% functions, 99.41% lines.
- md-generation e2e passed.
- Sierra e2e passed.
- Typecheck, build, knip, and oxlint passed.

Not run:

- `pnpm run lint`
- `pnpm run format`

Reason: those scripts mutate files via `--fix` / `--write`, and this was a review pass.

## Rubric

R1. Tick generation is deterministic, symbol-aware, and keeps market/session invariants true.

R2. Ring-buffer/history lengths match product intent: 20k bars for standard bars, 30 sessions for 1s price-level rows, epoch padding only where intended.

R3. Candle aggregation preserves OHLCV semantics across daily, time, volume, and 1s price-level outputs, including split ticks and empty/zero bars.

R4. Time/session handling is correct across UTC-aligned CME futures sessions, maintenance breaks, weekends, Unix epoch boundaries, and Sierra date expectations.

R5. CSV and SCID serialization/deserialization preserve schema, units, ordering, numeric precision, and BigInt/string contracts.

R6. Sierra sync feeds deterministic source data to Sierra and validates exported OHLC bars against generated source bars without stale-file or range false positives.

R7. Known exclusion of 500-volume Sierra validation remains explicit and does not silently weaken other validation paths.

R8. Source/generated/output path handling prevents stale, cross-symbol, or wrong-directory data from being consumed.

R9. CLI entrypoints fail fast with clear symbol requirements and do not hide operational failures.

R10. Shared contracts/constants are centralized and reused rather than duplicated across generation, sync, tests, and docs.

R11. Tests mirror `src`, exercise real implementations, and cover boundary cases likely to break the MVP data contract.

R12. E2E tests validate the real generation-to-Sierra contract without shortcuts, while remaining isolated from old generated artifacts.

R13. Public docs and scripts match live commands, file paths, required Node/pnpm versions, and generated output behavior.

R14. TypeScript/C++ bridge integration is schema-compatible with the TS Sierra sync code and Sierra chart artifacts.

R15. Code organization follows the repo's KISS/DRY/functions-first conventions without dead code or confusing module boundaries.

R16. Performance/resource usage is credible for 20k daily sessions plus 30-session 1s price-level history without accidental quadratic or unbounded memory behavior.

## Must Fix

### F1. [HIGH] 500-volume mismatch is likely bar-construction semantics, not only validation omission

Rubric: R3, R6, R7, R14

Locations:

- `src/md-generation/candles.ts:207`
- `src/md-generation/candles.ts:218`
- `src/sierra-sync/bridge-source.ts:104`
- `plans/m3/m3-checkpoint-4-validate-derived-bars.md:38`

Finding:

The current `VolumeAggregator` creates exact 500-volume bars by splitting a trade across bars. Sierra's Volume Per Bar behavior can produce bars equal to or greater than the configured volume unless `Split Data Records` is enabled and effective. The current bridge detects a chart with `IBPT_VOLUME_PER_BAR`, but it does not configure or verify Sierra's `Split Data Records` behavior.

User-observed chart behavior also suggests Sierra may split on session/day boundaries in a way that can cut the last bar early to keep the split even. That means the 500-volume contract may not be a pure threshold rule; it may be influenced by session boundaries and Sierra's own bar-finalization logic.

Why this matters:

This is the strongest explanation found for why `500v` was excluded. If Sierra is not splitting data records the same way our generator splits ticks, the first threshold-crossing trade changes the bar volume and can shift subsequent bar boundaries. That causes OHLCV mismatch even when both systems read the same `.scid` ticks.

Hard evidence:

An isolated probe using the same generated ticks compared two strategies:

```txt
current exact split first bar:
time: 1780524000000
open: 5999.25
high: 6001
low: 5999
close: 5999.5
volume: 500

threshold/no-split first bar:
time: 1780524000000
open: 5999.25
high: 6001
low: 5999
close: 5999.5
volume: 508
```

The first row diverges immediately on volume.

Repo evidence:

- `VolumeAggregator` uses `Math.min(remaining, targetVolume - current.volume)` and emits when current volume equals target.
- The old M3 plan explicitly called this out: Sierra may define volume-bar boundaries differently if a source trade crosses the 500-volume threshold.
- Decompressing `src-sierra-cpp/!tradester.Cht` found a readable `volume,500` marker, but did not reveal a readable `Split` marker. That absence is not conclusive because chartbook settings are binary.

External evidence:

- Sierra Chart docs state Volume Per Bar bars are equal to or greater than the setting.
- Sierra Chart docs recommend enabling `Split Data Records` for Volume Per Bar exactness.
- Sierra Chart docs say splitting can be necessary for volume charts because a single tick record can have volume greater than 1.
- Source: <https://www.sierrachart.com/index.php?page=doc%2FChartSettings.html>

Action:

Decide the contract.

If the source of truth is Sierra:

- Match Sierra's observed volume-bar construction.
- Re-enable `500v` validation once the behavior is understood.

If the source of truth is our exact split model:

- Force/prove the Sierra chartbook uses `Split Data Records`.
- Add a bridge/chartbook validation check that fails if Sierra is not configured to split records.

Recommended next test:

- Generate a tiny `.scid` with a known threshold-crossing sequence such as volumes `[300, 300, 100]`.
- Export Sierra's 500-volume chart.
- Compare whether Sierra emits `[600, 100]` threshold bars or `[500, 200]` exact-split bars.

### F2. [HIGH] Generated `5m` and `500v` rows can have invalid `bidVolume`/`askVolume` totals

Rubric: R3, R5, R11, R15

Locations:

- `src/md-generation/candles.ts:213`
- `src/md-generation/candles.ts:285`
- `src/md-generation/candles.ts:343`
- `src/md-generation/generate-market-data.ts:395`
- `src/md-generation/generate-market-data.ts:398`

Finding:

`VolumeAggregator` receives `side`, but when a volume bar already exists it calls `addTickValues(this.current, price, volume)` without passing `side`. That causes bid/ask increments to be zero for every appended or split chunk.

The price-level branch in `generate-market-data.ts` also omits `side` when pushing to the `5m` and `500v` aggregators.

Why this matters:

The generated CSV contract includes `bidVolume` and `askVolume`. Those fields become wrong in retained `5m` rows and in all multi-tick/split `500v` bars.

Hard evidence:

Small direct aggregator probe:

```txt
volume emitted before finish:
volume: 500
bidVolume: 300
askVolume: 0
```

Expected for input volumes `300 bid` plus `200 ask`:

```txt
volume: 500
bidVolume: 300
askVolume: 200
```

Generation invariant probe:

```txt
daily: badSide = -1
seconds15: badSide = -1
minutes5: badSide = 10
volume500: badSide = 0
```

Concrete generated bad rows:

```txt
minutes5 row:
time: 1777240800000
volume: 15
bidVolume: 0
askVolume: 0

volume500 row:
time: 1776981600000
volume: 500
bidVolume: 17
askVolume: 0
```

Refinement:

This does not explain the Sierra `500v` OHLCV mismatch by itself because current Sierra validation ignores Sierra bid/ask. It is still a source-data correctness bug for downstream indicator runtime work.

Action:

- Change `addTickValues(this.current, price, volume)` to pass `side`.
- Pass `side` in the price-level branch for `minutes5Aggregator` and `volume500Aggregator`.
- Add tests asserting `volume === bidVolume + askVolume` for `TimeAggregator`, `VolumeAggregator`, and generated `5m`/`500v` files.

### F3. [HIGH] Session handling is fixed UTC and docs/tests should reflect that contract

Rubric: R4, R12, R14

Locations:

- `src/md-generation/market-time.ts:9`
- `src/md-generation/market-time.ts:73`
- `src/__tests__/md-generation/market-time.node.test.ts:27`
- `src-sierra-cpp/tradester_sync_bridge.cpp:10`
- `src-sierra-cpp/tradester_sync_bridge.cpp:11`

Finding:

The generator and Sierra bridge use fixed UTC session hours:

```txt
SESSION_START_HOUR = 22
SESSION_END_HOUR = 21
```

This matches the repo's current UTC-based CME futures contract and the tests intentionally lock that behavior in.

Why this matters:

README and surrounding docs should not describe CT/DST behavior when the implementation is intentionally UTC-aligned.

Hard evidence:

Probe output:

```txt
anchor: 2026-01-04T23:00:00.000Z
start returned: 2026-01-04T22:00:00.000Z
```

Additional API hazard:

`getSessionStart(..., 0)` can return non-trading starts for weekend anchors. `generateMarketData` filters non-trading starts before generating, so this is currently contained in orchestration, but the lower-level API is not safe as a standalone session resolver.

Action:

- Keep the UTC contract documented consistently across README, plans, and tests.
- Keep the Sierra bridge and generator aligned to the same UTC session boundaries.
- Add tests for Friday evening and weekend anchors.

### ~~F4. [HIGH] Sierra sync does not prove `data-in` or exports belong to the current run~~

~~Sierra sync validates deterministic files for a symbol, but does not prove they came from the current CLI run.~~

### ~~F5. [HIGH] Failed Sierra validation can leave partial `data-out`~~

~~`mergeValidatedSierraExports` validates and writes one timeframe at a time, so a later failure can leave earlier output files published.~~

### F6. [MEDIUM] No-indicator Sierra exports produce invalid merged CSV

Rubric: R5, R6, R14

Locations:

- `src/sierra-sync/sierra-export.ts:73`
- `src/sierra-sync/sierra-export.ts:76`
- `src/sierra-sync/sierra-export.ts:89`
- `src/shared/file-ops/csv.ts:113`
- `src/__tests__/sierra-sync/sierra-export.node.test.ts:154`

Finding:

When there are no `tradester_` headers, the merge writes:

```txt
id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap,
```

Rows also end with a trailing comma.

Why this matters:

The output has an unnamed extra column and is not compatible with the project's own fixed candle parser.

Hard evidence:

Probe using `parseCandleRowsFast` on the merged no-indicator output:

```txt
Unexpected candle row header
```

Action:

- If no `tradester_` headers exist, write the generated header/rows unchanged.
- Or fail fast if indicator columns are required by the contract.
- Update the current test that locks in the trailing comma behavior.

### F7. [MEDIUM] Sierra validation accepts arbitrary extra Sierra rows

Rubric: R6, R12

Locations:

- `src/sierra-sync/sierra-export.ts:77`
- `src/sierra-sync/sierra-export.ts:79`
- `src/__tests__/sierra-sync/sierra-export.node.test.ts:95`

Finding:

Sierra rows are indexed by timestamp, then validation loops over generated rows only. Extra Sierra rows are accepted silently.

Why this matters:

This can mask wrong chart ranges or unrelated Sierra output. The current behavior allows the Sierra export to contain rows outside the source range and still pass.

Hard evidence:

Synthetic Sierra export with an unrelated extra row still returned:

```txt
comparedRows: 1
```

Action:

- Define allowed extra boundary policy explicitly.
- Fail on Sierra timestamps outside the generated comparable range unless they are known/documented boundary rows.
- Include first/last compared generated and Sierra timestamps in the validation summary.

## Should Fix

### F8. [MEDIUM] Sierra sync duplicates generator path and filename contracts

Rubric: R8, R10, R15

Locations:

- `src/sierra-sync/paths.ts:24`
- `src/sierra-sync/paths.ts:33`
- `src/md-generation/generate-market-data.ts:208`
- `src/sierra-sync/constants.ts:1`
- `src/contracts/defaults.ts:5`

Finding:

Generator output file construction lives in `generate-market-data.ts`. Sierra sync reconstructs the same paths independently and hard-codes the price-level suffix `1s_pl0.25`.

Why this matters:

Future symbols, tick sizes, output roots, or file names can drift between generation and Sierra sync.

Action:

- Move generated output path construction into a shared contract function.
- Have both generation and Sierra sync consume that function.

### ~~F9. [MEDIUM] `md-generation` e2e does not hash `.scid`~~

### F10. [MEDIUM] `runSierraSync` lacks a mirrored unit test around operation sequence

Rubric: R11, R12

Location:

- `src/sierra-sync/sierra-sync.ts:19`

Finding:

`runSierraSync` coordinates cleanup, process closing, bridge generation, build, SCID copy, chartbook copy, Sierra open, export wait, and merge. There is no mirrored unit test with fake `SierraOps` verifying order and failure boundaries.

Why this matters:

The e2e is valuable but expensive and environment-dependent. A unit test would catch operation-order regressions, especially around cleanup/freshness and partial output.

Action:

- Add `src/__tests__/sierra-sync/sierra-sync.node.test.ts`.
- Use fake `SierraOps`.
- Assert ordering, expected export names, fail-fast behavior, and no merge before exports are ready.

### F11. [MEDIUM] README and plans drift from live paths/modules

Rubric: R13

Locations:

- `README.md:63`
- `README.md:92`
- `plans/m3/m3-spec.md:23`
- `plans/m3/m3-checkpoint-5-write-validated-output.md:54`

Finding:

README shows outputs under `data/ES`, but live default output is `data-in/<symbol>`.

README imports from `./src/domain/...`, but live modules are under `src/md-generation`.

Plans describe historical command/path decisions, including run-name output paths that the current implementation does not use.

Action:

- Update README output paths to `data-in/<symbol>`.
- Fix library import examples.
- Mark M3 plans historical or update them to current architecture.

### F12. [MEDIUM] Benchmarks do not exercise MVP-scale generation

Rubric: R16

Location:

- `scripts/benchmark-generation.ts:48`

Finding:

Largest benchmark scenario is 500 sessions. MVP default/e2e workload is 20,000 daily sessions plus 30 retained price-level sessions.

Action:

- Add a full-scale benchmark scenario.
- Or document a scaled proxy with extrapolation limits.
- Add a package script such as `benchmark:generation`.

## Nice To Fix

### F13. [LOW] Retention constants are private and duplicated

Rubric: R10

Locations:

- `src/md-generation/generate-market-data.ts:43`
- `src/md-generation/generate-market-data.ts:44`
- `src/__tests__/__e2e__/md-generation/md-generation.e2e.test.ts:11`
- `README.md:63`

Finding:

The generator keeps product-level retention values private, and the same values are repeated in tests and docs.

```ts
// current shape in src/md-generation/generate-market-data.ts
const priceLevelSessions = 30;
const retainedBars = 20_000;
```

Why this is bad:

These values are part of the product contract, not an implementation detail. Keeping them private creates drift risk between generation, tests, and docs.

```ts
// proposed shape in src/contracts/defaults.ts or a dedicated shared contract
export const DEFAULT_RETAINED_BARS = 20_000;
export const DEFAULT_PRICE_LEVEL_SESSIONS = 30;
```

```ts
// proposed usage in src/md-generation/generate-market-data.ts
import { DEFAULT_PRICE_LEVEL_SESSIONS, DEFAULT_RETAINED_BARS } from '../contracts/defaults.ts';

const priceLevelSessions = DEFAULT_PRICE_LEVEL_SESSIONS;
const retainedBars = DEFAULT_RETAINED_BARS;
```

```ts
// proposed usage in tests/docs
import { DEFAULT_PRICE_LEVEL_SESSIONS, DEFAULT_RETAINED_BARS } from '../contracts/defaults.ts';
```

Why the change is good:

- one source of truth for product-level retention values
- tests and docs stop hard-coding magic numbers
- future changes only happen in one place

### F14. [LOW] `waitForFiles` advertises a timeout parameter but ignores it

Rubric: R15

Locations:

- `src/sierra-sync/sierra-ops.ts:36`
- `src/sierra-sync/sierra-ops.ts:166`
- `src/sierra-sync/sierra-sync.ts:73`

Finding:

`SierraOps.waitForFiles` accepts `waitTimeout`, and `runSierraSync` passes `SIERRA_WAIT_TIMEOUT_MS`, but the concrete implementation ignores the parameter and uses the constant directly.

Action:

- Thread the parameter into the deadline calculation.
- Or remove the parameter from the interface and call site.

## 500-Volume Deep Dive

### What we know

The code intentionally excludes 500-volume Sierra validation:

```ts
export const VALIDATED_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => timeframe.suffix !== '500v');
```

The old M3 plan expected 500-volume validation, but called it the riskiest derived comparison because Sierra may define volume-bar boundaries differently when source trades cross the 500-volume threshold.

The current generator's volume bar behavior:

- Splits a source tick into multiple bar chunks if it crosses the threshold.
- Emits bars when volume is exactly `500`.
- Carries the same timestamp into same-tick split bars and uses sequence IDs to disambiguate.

Sierra's documented behavior:

- Volume Per Bar creates bars equal to or greater than the configured setting.
- `Split Data Records` is recommended for Volume Per Bar exactness.
- A single 1-tick data record can have volume greater than 1, so splitting may be required.

The chartbook contains `volume,500` after decompression.

The chartbook did not reveal a readable `Split` marker in the extracted ASCII strings. That is not conclusive, but it means this review did not prove Sierra's split setting is enabled.

### Most likely root cause

Our generated `500v` source bars and Sierra's `500 Volume` chart are probably not using the same split policy.

If Sierra is using threshold/no-split semantics, a trade that crosses the 500-volume threshold remains fully in the bar that crosses the threshold. That bar has volume greater than 500 and the next bar starts at the next trade.

Our generator splits the crossing trade so the current bar is exactly 500 and the remainder starts the next bar.

That changes:

- Volume.
- Bar boundaries.
- Potentially close of the current bar.
- Potentially open/high/low/close of later bars.

### Secondary bug in our 500v implementation

Even if exact split is the intended contract, our current `500v` implementation loses bid/ask volume during appends/splits.

That does not explain Sierra OHLCV mismatch because bid/ask is ignored for this milestone, but it must be fixed before these rows are trustworthy as source data.

### Recommended 500v validation plan

Create a minimal deterministic Sierra probe:

```txt
Tick 1: price 100, volume 300
Tick 2: price 101, volume 300
Tick 3: price 99, volume 100
```

Expected if exact split:

```txt
Bar 1: volume 500
Bar 2: volume 200
```

Expected if threshold/no-split:

```txt
Bar 1: volume 600
Bar 2: volume 100
```

Run this through Sierra with the current chartbook and inspect the exported `500v` bars.

Then either:

- Change our aggregator to match Sierra.
- Or change/prove Sierra chart settings to match our exact split aggregator.

## Rubric Checklist

R1. Tick generation is deterministic, symbol-aware, and keeps market/session invariants true - pass.

R2. Ring-buffer/history lengths match product intent - pass with cleanup note F13.

R3. Candle aggregation preserves OHLCV semantics - fail, see F1 and F2.

R4. Time/session handling is UTC/Sierra-correct - fail, see F3.

R5. CSV and SCID serialization preserve schema/contracts - fail, see F6 and F9.

R6. Sierra sync validates without stale/range false positives - fail, see F1, F4, F7.

R7. 500-volume validation exclusion remains explicit - pass, but see F1.

R8. Path handling prevents stale/wrong artifacts - fail, see F4, F5, F8.

R9. CLI entrypoints fail fast with clear symbol requirements - pass.

R10. Contracts/constants are centralized - fail, see F8 and F13.

R11. Tests mirror `src` and cover key boundary cases - fail, see F9 and F10.

R12. E2E validates real generation-to-Sierra contract and isolation - fail, see F4, F7, F9.

R13. Docs/scripts match live behavior - fail, see F11.

R14. TS/C++ bridge integration is schema-compatible - partially checked; chartbook binary settings remain uncertain.

R15. Code organization follows KISS/DRY/functions-first - fail, see F2, F8, F14.

R16. MVP-scale performance/resource usage is credible - needs better evidence, see F12.

## Residual Uncertainty

The exact Sierra chartbook setting for `Split Data Records` was not conclusively decoded from `!tradester.Cht`.

The `.Cht` file is binary/zlib data. I decompressed it and extracted readable strings, but did not fully reverse the chartbook setting schema.

The fixed UTC session behavior is the documented contract and should be stated consistently across README, plans, and tests.

The review did not inspect Sierra GUI settings directly.

The review did not modify code or tests.

## Recommended Fix Order

1. Decide and test Sierra `500v` semantics with the minimal threshold-crossing `.scid` probe.
2. Fix side-volume propagation and add `volume === bidVolume + askVolume` invariants.
3. Add generation manifest/freshness checks for Sierra sync.
4. Make Sierra output publication all-or-nothing.
5. Fix no-indicator merged CSV output.
6. Keep the UTC session contract documented consistently and remove stale CT/DST wording.
7. Add missing `.scid` hash and `runSierraSync` unit tests.
8. Centralize path/retention contracts.
9. Update README and mark old M3 plans as historical or current.
