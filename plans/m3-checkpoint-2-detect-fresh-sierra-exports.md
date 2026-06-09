# M3 Checkpoint 2 Plan: Detect Fresh Sierra Exports

## Checkpoint

After reload, the sync detects fresh Sierra `.txt` exports.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

After Sierra reloads, `generate:sierra` waits until every required Sierra export file exists, was written for the current run, and contains readable bar/study data.

## Researched Facts

- Current Sierra Data folder has one real export file: `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\Data\tradester_ES[M]  1 Sec  #1_GraphData.txt`.
- Its current header is `Date, Time, Open, High, Low, Last, Volume, # of Trades, OHLC Avg, HLC Avg, HL Avg, Bid Volume, Ask Volume, tradester_sma100`.
- Its first rows use Sierra date/time text like `2026-5-7, 00:00:04.000000`.
- Sierra's Write Bar and Study Data docs say the output file is written to the Sierra Data Files Folder by default and is only open while Sierra is actively writing, so a polling reader is reasonable: https://www.sierrachart.com/index.php?ID=379&page=doc%2FStudiesReference.php
- The same docs say export timestamps match the chart time zone.
- ACSIL `sc.WriteBarAndStudyDataToFileEx` supports explicit output paths and export options: https://www.sierrachart.com/index.php?page=doc%2FACSIL_Members_Functions.html
- Local source confirms `s_WriteBarAndStudyDataToFile` supports `OutputPathAndFileName`, `UseUTCTime`, `WriteStudyData`, and delimiter options in `ACS_Source\scstructures.h` and `ACS_Source\Studies6.cpp`.

## File Mapping Decision

Use the chart names from the hard spec as the logical mapping, but discover exact files by current run metadata whenever possible.

| Bar type   | Our generated CSV            | Sierra chart name                | Current/expected Sierra export                                   |
| ---------- | ---------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| 1 second   | `tradester_ES_1s_pl0.25.csv` | `tradester_ES 1 Sec #1 L:1`      | currently observed as `tradester_ES[M]  1 Sec  #1_GraphData.txt` |
| 15 seconds | `tradester_ES_15s.csv`       | `tradester_ES 15 Sec #2 L:1`     | expected `*15 Sec*#2*_GraphData.txt`                             |
| 500 volume | `tradester_ES_500v.csv`      | `tradester_ES 500 Volume #3 L:1` | expected `*500 Volume*#3*_GraphData.txt`                         |
| 5 minutes  | `tradester_ES_5m.csv`        | `tradester_ES 5 Min #4 L:1`      | expected `*5 Min*#4*_GraphData.txt`                              |
| 1 day      | `tradester_ES_1d.csv`        | `tradester_ES 1 Day #5 L:1`      | expected `*1 Day*#5*_GraphData.txt`                              |

Gut decision: if the ACSIL bridge controls `OutputPathAndFileName`, use deterministic filenames instead of globbing Sierra's generated names: `tradester_ES_1s_GraphData.txt`, `tradester_ES_15s_GraphData.txt`, `tradester_ES_500v_GraphData.txt`, `tradester_ES_5m_GraphData.txt`, and `tradester_ES_1d_GraphData.txt`.

If we cannot control filenames yet, use strict glob patterns plus chart-number matching.

## Freshness Decision

A file is fresh only when all are true:

- It exists.
- Its last write time is greater than or equal to the `generate:sierra` reload request timestamp.
- Its size is greater than the header-only minimum.
- Its header contains `Date`, `Time`, `Open`, `High`, `Low`, `Last`, and `Volume`.
- Its header can include zero or more `tradester_` columns.
- If the bridge writes an acknowledgement, the acknowledgement run id matches the current run id.

Gut decision: use both file modified time and acknowledgement run id when the bridge exists; use modified time and header validation only for early/manual testing.

## Timestamp Decision

Do not decide UTC vs Chicago by assumption. Decide it in planning/implementation by comparing the first generated row timestamp to Sierra's first matching candidate row.

Default preference:

- Configure Sierra export with `UseUTCTime = 1` if we control `WriteBarAndStudyDataToFileEx`.
- If using existing Sierra chart/study settings, detect whether Sierra export is UTC+0 or America/Chicago by checking which parsed value matches our first generated `time`.
- Persist the selected timestamp mode in the run result so later checkpoints use the same mode.

## Implementation Shape

- Add `sierra-export-files.ts` for expected file mapping and discovery.
- Add `wait-for-sierra-exports.ts` with timeout polling.
- Add `parse-sierra-header.ts` that trims spaces and records column indexes.
- Add `sierra-time-zone.ts` that can parse Sierra `Date` + `Time` as UTC and Chicago.
- Return a manifest of detected files to later checkpoints.

## Tests

- Unit-test file glob mapping with the observed `tradester_ES[M]  1 Sec  #1_GraphData.txt` filename.
- Unit-test header parsing with the observed real header.
- Unit-test freshness rules for missing, stale, header-only, malformed, and fresh files.
- Unit-test timestamp parser for `2026-5-7, 00:00:04.000000`.
- Integration-test fake Sierra exports with current run timestamps and all five expected files.

## Done Criteria

- `generate:sierra` can identify all five required export files or fail with a clear missing-file message.
- The detected files are fresh for the current run.
- The detected files expose required OHLCV columns and any `tradester_` study columns.
- The timestamp mode is proven or explicitly recorded as unresolved with a blocking reason.
- Agent marks checkpoint ready for human review with file list, timestamps, and freshness evidence.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- Whether we will force deterministic export filenames through ACSIL. My recommendation: yes.
- Whether Sierra should export UTC by setting `UseUTCTime = 1`. My recommendation: yes, because our generated `time` is epoch milliseconds and UTC is less ambiguous.
- Whether stale existing Sierra exports should be deleted before a run. My recommendation: delete or overwrite only our known export files at run start.
