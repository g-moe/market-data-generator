# M3 Checkpoint 3 Plan: Validate 1-Second Bars

## Checkpoint

1-second generated OHLCV bars match Sierra's 1-second OHLCV bars before Sierra sync writes the named run output.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Status

Blocked by hard todo. Implementation exists, but checkpoint 3 is not ready for human review until Sierra proves it loads the newly copied `.scid` data into already-open charts.

## Plain-English Outcome

After Sierra writes fresh exports into `data-out-temp/<symbol>/latest`, `generate:sierra` validates the generated 1-second CSV against Sierra's 1-second GraphData export. If the first generated timestamp cannot be found in Sierra, or any later timestamp/OHLCV value differs, the command fails and does not write the named run output.

## Current Decisions

- Validate only the 1-second file in this checkpoint.
- Use the generated file path from `generation.files.priceLevel`.
- Use the Sierra file path from `data-out-temp/<symbol>/latest/tradester_<symbol>_1s_GraphData.txt`.
- Compare generated `open` to Sierra `Open`.
- Compare generated `high` to Sierra `High`.
- Compare generated `low` to Sierra `Low`.
- Compare generated `close` to Sierra `Last`.
- Compare generated `volume` to Sierra `Volume`.
- Ignore Sierra `NumberOfTrades`, `BidVolume`, and `AskVolume` for this checkpoint.
- Preserve generated `bidVolume`, `askVolume`, and `vwap`; they are not part of the Sierra equality check.
- Parse Sierra GraphData timestamps as America/Chicago chart-local time; real Sierra e2e showed 2026-06-04 17:00:00 for generated 2026-06-04T22:00:00.000Z.
- Use exact parsed-number equality unless real Sierra precision forces a human-reviewed change.
- Do not use nearest-neighbor timestamp matching.

## Hard Blocking Todos

- Prove that when `generate:sierra` copies newly generated data into Sierra's `.scid` file, Sierra accepts and displays that new data on the chart while the chart is already open. This must be verified in the real Sierra flow before marking checkpoint 3 ready for human review or moving to another milestone.

## Current Paths

- Generated 1-second CSV: `data-in/<symbol>/tradester_<symbol>_1s_pl0.25.csv`.
- Sierra latest export: `data-out-temp/<symbol>/latest/tradester_<symbol>_1s_GraphData.txt`.
- Named run copy: `data-out/<symbol>/<run-name>/tradester_<symbol>_1s_GraphData.txt`.

## Implementation Plan

1. Add a Sierra GraphData parser for the bridge's tab-delimited export.
2. Add a 1-second validation function that aligns by the first generated timestamp and then compares rows in order.
3. Unit test successful alignment, missing first timestamp, timestamp drift, OHLCV mismatch, and Sierra running out of rows.
4. Wire validation into `runSierraSync` after fresh exports are detected and before files are copied to the named run.
5. Use the real Sierra e2e test as the final checkpoint verification after unit tests pass.

## Done Criteria

- Core validation behavior is covered by unit tests.
- `generate:sierra` validates the 1-second generated CSV before writing the named run output.
- Validation failures hard fail before `data-out/<symbol>/<run-name>` is written.
- The Sierra e2e test passes against the real Sierra flow.
- Real Sierra verifies newly copied `.scid` data appears on already-open charts.
- Human review accepts this checkpoint.

## Things We Need To Align On Before Implementation

- None. Timezone is now based on the real Sierra e2e observation. If real Sierra e2e shows a precision mismatch, stop and update this plan before changing comparison rules.
