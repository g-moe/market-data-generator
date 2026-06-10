# M3 Checkpoint 4 Plan: Validate Derived Bars

## Checkpoint

15-second, 5-minute, 500-volume, and 1-day bars match Sierra's OHLCV bars.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

After 1-second validation works, use the same parser and comparison rules for every derived timeframe. Each generated file must find its matching Sierra export, find its start timestamp, and match OHLCV row-for-row.

## Files

| Bar type   | Our generated CSV       | Sierra chart name                | Validation fields |
| ---------- | ----------------------- | -------------------------------- | ----------------- |
| 15 seconds | `tradester_ES_15s.csv`  | `tradester_ES 15 Sec #2 L:1`     | OHLCV             |
| 5 minutes  | `tradester_ES_5m.csv`   | `tradester_ES 5 Min #4 L:1`      | OHLCV             |
| 500 volume | `tradester_ES_500v.csv` | `tradester_ES 500 Volume #3 L:1` | OHLCV             |
| 1 day      | `tradester_ES_1d.csv`   | `tradester_ES 1 Day #5 L:1`      | OHLCV             |

## Researched Facts

- Current generated files already include `tradester_ES_15s.csv`, `tradester_ES_5m.csv`, `tradester_ES_500v.csv`, and `tradester_ES_1d.csv` under the generated output directory.
- Current Sierra Data folder only had the 1-second GraphData export when checked, so the other four exports need Sierra chart/study setup before implementation can be verified against the real app.
- Sierra reload/recalculate is local-file based and recalculates studies, which is the right behavior after replacing `.scid` files.
- Sierra export can include all chart bars except the last bar when `StartingIndex = 0` and `IncludeLastBar = 0` in `WriteBarAndStudyDataToFileEx`; this matters for row-count expectations.

## Comparison Decisions

- Reuse the exact same comparison engine from checkpoint 3.
- Each file validates independently and reports its own failure.
- The full checkpoint is ready for human review only when all four derived validations pass.
- Use exact numeric comparison by default.
- Do not compare `bidVolume`, `askVolume`, `vwap`, `# of Trades`, averages, or study columns.
- Start timestamp matching is per file, not inherited from the 1-second file.

## 500-Volume Bar Decision

The 500-volume chart is the riskiest derived comparison because Sierra may define volume-bar boundaries differently if the source data has trades that cross a 500-volume threshold.

Gut decision:

- Treat our 500-volume bars as authoritative for generated output.
- Compare against Sierra exactly.
- If Sierra splits a tick that crosses the threshold and our generator does not, fail and re-evaluate the 500-volume construction rule before loosening validation.

## 1-Day Bar Decision

Daily bars can be ambiguous if Sierra uses session settings rather than UTC calendar days.

Gut decision:

- Validate against the Sierra chart named `tradester_ES 1 Day #5 L:1`, not against generic calendar-day assumptions.
- Use the timestamp mode proven in checkpoint 2.
- If daily timestamp boundaries do not match, inspect Sierra chart session settings before changing generator logic.

## Implementation Shape

- Add a validation manifest listing all timeframe jobs.
- Reuse one generic `validateSierraBars(job)` function.
- Return a result per file: generated file path, Sierra file path, rows skipped, rows compared, first matched timestamp, and last matched timestamp.
- Aggregate results and fail the whole checkpoint if any file fails.

## Tests

- Unit-test validation manifest contains all four derived jobs.
- Unit-test each job maps to the correct generated filename and chart/export identity.
- Unit-test aggregate reporting for one failure among multiple successes.
- Fixture-test 15-second, 5-minute, 500-volume, and 1-day comparisons using compact representative files.
- Integration-test fake Sierra exports for all four derived files.

## Done Criteria

- All four derived file validations pass against fresh Sierra output.
- Failures identify the exact timeframe and field.
- Row counts and first/last timestamps are reported for human review.
- Agent marks checkpoint ready for human review with validation summaries for all four files.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- Whether the 500-volume generator should split oversized ticks if Sierra does. My recommendation: do not change until exact Sierra output proves a mismatch.
- Whether daily bars should follow Sierra chart session settings if they differ from generated UTC sessions. My recommendation: yes, Sierra is the comparison authority for this checkpoint.
- Whether all four validations should fail fast on the first bad file or continue and report every bad file. My recommendation: continue per file and return a complete failure report.
