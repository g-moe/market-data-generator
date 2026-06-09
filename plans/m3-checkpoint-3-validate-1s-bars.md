# M3 Checkpoint 3 Plan: Validate 1-Second Bars

## Checkpoint

1-second generated OHLCV bars match Sierra's 1-second OHLCV bars.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Status

Complete and human-reviewed for the current milestone scope. Remaining comparison work should continue from the implemented Sierra export flow, not the older request/ack design.

## Plain-English Outcome

The validation path uses the fresh Sierra 1-second export produced by Checkpoint 2 and compares it against the generated 1-second CSV. We align by timestamp, then compare open, high, low, close, and volume in order.

## Current Decisions

- Compare generated `open` to Sierra `Open`.
- Compare generated `high` to Sierra `High`.
- Compare generated `low` to Sierra `Low`.
- Compare generated `close` to Sierra `Last`.
- Compare generated `volume` to Sierra `Volume`.
- Ignore Sierra `Bid Volume` and `Ask Volume` for this milestone.
- Preserve generated `bidVolume`, `askVolume`, and `vwap` in our CSV output.
- Use exact parsed-number equality unless real Sierra precision forces a human-reviewed change.
- Do not use nearest-neighbor timestamp matching.

## Current Paths

- Generated 1-second CSV: `data-in/<symbol>/tradester_<symbol>_1s_pl0.25.csv`.
- Sierra latest export: `data-out-temp/<symbol>/latest/tradester_<symbol>_1s_GraphData.txt`.
- Named run copy: `data-out/<symbol>/<run-name>/tradester_<symbol>_1s_GraphData.txt`.

## Done Criteria

- Fresh Sierra exports are available from Checkpoint 2.
- The 1-second validation rule is documented against the current file locations.
- No stale Sierra Data globbing, request JSON, acknowledgement, or fake export fixture is treated as the source of truth.
- Human review accepted this checkpoint.

## Things We Need To Align On Before Implementation

- None. This checkpoint is complete for the current milestone scope.
