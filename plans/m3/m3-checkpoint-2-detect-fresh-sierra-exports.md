# M3 Checkpoint 2 Plan: Detect Fresh Sierra Exports

## Checkpoint

After Sierra exports chart data, `generate:sierra` detects fresh Sierra `.txt` exports and copies them to the named run output.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Status

Complete and human-reviewed as of the current Sierra flow.

## Plain-English Outcome

`generate:sierra` waits for every required Sierra export file in `data-out-temp/<symbol>/latest`. Once all files are fresh and non-empty, Node copies them to `data-out/<symbol>/<run-name>`. If the files do not appear before timeout, the command hard fails.

## Current Decisions

- The C++ bridge writes directly to `data-out-temp/<symbol>/latest`.
- Node polls deterministic files rather than looking for a request acknowledgement.
- Node does not delete the `latest` files before a run because Sierra can hold them open.
- Freshness is based on modified time at or after the run start plus non-zero size.
- Named run preservation happens by copying from `latest` to `data-out/<symbol>/<run-name>`.
- `data-out-temp` remains available while later validation checkpoints use it.

## File Mapping

| Bar type   | Sierra export file                |
| ---------- | --------------------------------- |
| 1 second   | `tradester_ES_1s_GraphData.txt`   |
| 15 seconds | `tradester_ES_15s_GraphData.txt`  |
| 500 volume | `tradester_ES_500v_GraphData.txt` |
| 5 minutes  | `tradester_ES_5m_GraphData.txt`   |
| 1 day      | `tradester_ES_1d_GraphData.txt`   |

## Implementation Shape

- `latestSierraOutputDir` resolves to `data-out-temp/<symbol>/latest`.
- `waitForFreshSierraOutputs` polls expected deterministic filenames until all are fresh.
- `copySierraOutputsToRun` copies fresh latest files to `data-out/<symbol>/<run-name>`.
- Timeout errors should name the missing or stale files.

## Tests

- Unit coverage verifies fixed latest paths and deterministic export names.
- Unit/CLI coverage verifies run-name output copying.
- The Sierra e2e test uses real Sierra and real paths; it does not fake Sierra data.

## Done Criteria

- `generate:sierra` waits for all five required export files or fails clearly.
- Detected files are fresh for the current run.
- Files are copied to `data-out/<symbol>/<run-name>`.
- No acknowledgement file is used.
- Human review accepted this checkpoint.

## Things We Need To Align On Before Implementation

- None. This checkpoint is complete.
