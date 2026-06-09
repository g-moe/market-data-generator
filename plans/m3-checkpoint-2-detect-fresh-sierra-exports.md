# M3 Checkpoint 2 Plan: Detect Fresh Sierra Exports

## Checkpoint

After Sierra reload/export, `generate:sierra` detects fresh Sierra `.txt` exports for the current run.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

After Checkpoint 1 writes the Sierra request/config, `generate:sierra` waits until every required Sierra export file exists in `data-out-temp/<symbol>/<run-name>`, was written for the current run, is no longer changing, and contains readable bar/study data. If that does not happen before timeout, the command hard fails.

## Current State

- A real smoke run has proven Sierra can write all five chart export files into `data-out-temp/ES/<run-name>`.
- Current code previously used an acknowledgement-style completion signal; this checkpoint replaces that with polling the actual files we need.
- Ack may fire before every chart file finishes, so it is not a reliable completion boundary.
- `data-out-temp/` should remain available after the run for validation checkpoints and be cleaned up only at the end of the full milestone flow.

## Researched Facts

- Observed Sierra export header includes: `Date, Time, Open, High, Low, Last, Volume, # of Trades, OHLC Avg, HLC Avg, HL Avg, Bid Volume, Ask Volume, tradester_sma100`.
- Observed Sierra export rows use date/time text like `2026-5-7, 00:00:04.000000`.
- Sierra's Write Bar and Study Data study writes bar fields plus study subgraph values and updates the file in real time: https://www.sierrachart.com/index.php?ID=379&page=doc%2FStudiesReference.php
- Sierra's `sc.WriteBarAndStudyDataToFile` docs say `StartingIndex = 0` creates a new file, writes a header, and writes all chart bars except the last bar: https://www.sierrachart.com/index.php?page=doc%2FACSIL_Members_Functions.html
- Sierra's `OutputPathAndFileName` parameter is a complete output path, so the bridge can write directly into our run temp folder.
- Local source confirms `s_WriteBarAndStudyDataToFile` supports explicit output path and additional export controls in `ACS_Source\scstructures.h` / `ACS_Source\Studies6.cpp`.

## File Mapping Decision

Use deterministic filenames written directly into the current run temp folder.

| Bar type   | Our generated CSV            | Sierra chart name                | Sierra export path                                            |
| ---------- | ---------------------------- | -------------------------------- | ------------------------------------------------------------- |
| 1 second   | `tradester_ES_1s_pl0.25.csv` | `tradester_ES 1 Sec #1 L:1`      | `data-out-temp/ES/<run-name>/tradester_ES_1s_GraphData.txt`   |
| 15 seconds | `tradester_ES_15s.csv`       | `tradester_ES 15 Sec #2 L:1`     | `data-out-temp/ES/<run-name>/tradester_ES_15s_GraphData.txt`  |
| 500 volume | `tradester_ES_500v.csv`      | `tradester_ES 500 Volume #3 L:1` | `data-out-temp/ES/<run-name>/tradester_ES_500v_GraphData.txt` |
| 5 minutes  | `tradester_ES_5m.csv`        | `tradester_ES 5 Min #4 L:1`      | `data-out-temp/ES/<run-name>/tradester_ES_5m_GraphData.txt`   |
| 1 day      | `tradester_ES_1d.csv`        | `tradester_ES 1 Day #5 L:1`      | `data-out-temp/ES/<run-name>/tradester_ES_1d_GraphData.txt`   |

Do not glob Sierra's Data folder for chart-generated names when the bridge controls the output path.

## Freshness Decision

A file is fresh only when all are true:

- It exists at the deterministic path for the current run.
- Its last write time is greater than or equal to the current `generate:sierra` request timestamp.
- Its size is greater than the header-only minimum.
- Its size and modified time remain stable across at least one polling interval.
- Its header contains `Date`, `Time`, `Open`, `High`, `Low`, `Last`, and `Volume`.
- Its header can include zero or more `tradester_` columns.

Do not use an acknowledgement file for freshness.

## Timestamp Decision

Default to UTC export when the ACSIL writer supports it. If Sierra's exported timestamps do not match generated UTC timestamps during validation, record the detected mode and re-evaluate in Checkpoint 3.

Checkpoint 2 only needs to parse enough timestamp text to prove the file is readable. Exact timestamp equivalence belongs to validation checkpoints.

## Implementation Shape

- Add expected export file mapping from the existing request/config shape.
- Add `wait-for-sierra-exports.ts` or equivalent inside `src/sierra-sync/`.
- Poll every `pollIntervalMs` until all expected files are fresh and stable or `reloadTimeoutMs` expires.
- Return a manifest of detected exports with path, size, modified time, header columns, and stability evidence.
- On timeout, throw a clear error listing missing, stale, unstable, or malformed files.
- Keep the temp files in `data-out-temp/<symbol>/<run-name>` for Checkpoints 3 and 4.

## Tests

- Unit-test expected deterministic file mapping.
- Unit-test header parsing with the observed real header.
- Unit-test freshness rules for missing, stale, header-only, malformed, changing, and fresh files.
- Unit-test timeout error messages include the failing filenames and reasons.
- Integration-test fake Sierra exports with current run timestamps and all five expected files.

## Done Criteria

- `generate:sierra` waits for all five required export files or fails with a clear timeout message.
- The detected files are fresh for the current run.
- The detected files are stable before the command proceeds.
- The detected files expose required OHLCV columns and any `tradester_` study columns.
- The command returns or logs a manifest with file list, timestamps, sizes, and freshness evidence.
- Agent marks checkpoint ready for human review with file list, timestamps, and freshness evidence.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- None currently. Deterministic ACSIL output paths, Node-owned polling, and no ack-based completion are the intended design.
