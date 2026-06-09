# M3 Checkpoint 3 Plan: Validate 1-Second Bars

## Checkpoint

1-second OHLCV bars match Sierra's OHLCV bars.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

The 1-second generated CSV is compared against Sierra's 1-second export. We skip Sierra rows until our first generated timestamp appears, then every generated bar must match Sierra in order for open, high, low, close, and volume.

## Researched Facts

- The actual 1-second Sierra export currently exists as `tradester_ES[M]  1 Sec  #1_GraphData.txt`.
- Its header maps Sierra `Last` to our `close`.
- The current generated sample file is `data\ES\tradester_ES_1s_pl0.25.csv`.
- Existing generated sample rows currently begin at `1777240800000`, which is `2026-04-26T22:00:00.000Z` or `2026-04-26 17:00:00` Chicago. The current Sierra export begins at `2026-5-7 00:00:04`, so existing files are stale/mismatched and must not be used as proof.
- Sierra export timestamps follow chart time zone unless `UseUTCTime` is enabled through ACSIL export.

## Comparison Decisions

- Compare generated `open` to Sierra `Open`.
- Compare generated `high` to Sierra `High`.
- Compare generated `low` to Sierra `Low`.
- Compare generated `close` to Sierra `Last`.
- Compare generated `volume` to Sierra `Volume`.
- Ignore Sierra `Bid Volume` and `Ask Volume` for this milestone.
- Keep generated `bidVolume`, `askVolume`, and `vwap` in final output, but do not validate them against Sierra.
- Use exact numeric equality by default.
- Normalize numeric text by parsing to numbers, then compare exact numeric values. Do not use epsilon tolerance initially.
- If exact comparison fails only because Sierra rounds display/export precision, stop and re-evaluate with the user before changing the rule.

## Timestamp Start Decision

- Parse our first `time` as epoch milliseconds.
- Parse Sierra `Date` + `Time` using the timestamp mode proven in checkpoint 2.
- Skip Sierra rows until the parsed Sierra timestamp equals our first generated timestamp.
- If no exact timestamp is found, hard fail.
- Do not try nearest-neighbor matching; that can hide bar-construction bugs.

## Implementation Shape

- Add `parse-sierra-export.ts` for streaming/iterative parsing of Sierra rows.
- Add `compare-bars.ts` for deterministic row-by-row comparison.
- Add `find-start-row.ts` for skip-until-start logic.
- Add a structured validation error with our CSV path, Sierra path, row indexes, timestamps, field name, expected value, and actual value.
- Keep parsing streaming-friendly because Sierra files can be large.

## Tests

- Unit-test successful start detection after skipped Sierra rows.
- Unit-test hard failure when the start timestamp is missing.
- Unit-test hard failure when Sierra runs out of rows after compare mode starts.
- Unit-test each OHLCV field mismatch produces a useful error.
- Unit-test exact numeric comparison for integer and decimal values such as `4335.50` vs `4335.5`.
- Integration-test 1-second validation using fixture files shaped like the real Sierra header.

## Done Criteria

- The 1-second file comparison passes against fresh Sierra output.
- Any mismatch fails with a useful, field-specific message.
- The output includes proof of row counts and the timestamp mode used.
- Agent marks checkpoint ready for human review with the compared file paths and validation summary.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- Whether exact parsed-number equality is acceptable for prices like `4335.50` vs `4335.5`. My recommendation: yes, because they are the same numeric value.
- Whether the first 1-second generated CSV should be renamed from `tradester_ES_1s_pl0.25.csv` to a simpler deterministic name. My recommendation: keep existing name for now.
- Whether row-count mismatches should report all missing rows or fail on the first missing row. My recommendation: fail fast with counts and first missing index.
