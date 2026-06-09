# M3 Checkpoint 5 Plan: Write Validated Output

## Checkpoint

Validated output is written to `data-out/<symbol>/${user-cli-arg}` with `tradester_` study columns appended.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

Only after Sierra validation passes, write final CSV files that keep our generated bar rows and append Sierra study columns whose headers start with `tradester_`.

## Researched Facts

- The observed Sierra export currently includes one `tradester_` column: `tradester_sma100`.
- Sierra export also includes non-study/non-output columns like `# of Trades`, `OHLC Avg`, `HLC Avg`, `HL Avg`, `Bid Volume`, and `Ask Volume`.
- The hard spec says final output appends only Sierra columns whose names start with `tradester_`.
- Sierra `Bid Volume` and `Ask Volume` are ignored for this milestone.
- Output must not be partial: a file should only be written after its full bar sequence passes validation.

## Output Decision

For each validated file, final output should be:

`our generated columns + Sierra tradester_* columns`

Example:

`id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap,tradester_sma100`

Do not append:

- Sierra `Date`
- Sierra `Time`
- Sierra OHLCV fields
- Sierra `# of Trades`
- Sierra average columns
- Sierra `Bid Volume`
- Sierra `Ask Volume`
- Any Sierra column that does not start with `tradester_`

## Write Safety Decision

- Write each final output file to a temporary path first.
- Rename the temp file into place only after all rows for that file are written.
- Do not write any output for a file that failed validation.
- For the full checkpoint, prefer all-or-nothing output: if any timeframe fails validation, do not publish final output for any timeframe.

## Implementation Shape

- Extend validation to produce matched row pairs or a stable match index map.
- Add `extractTradesterColumns(header)`.
- Add `writeValidatedOutput(job, matchedRows)`.
- Output path:
  - `data-out/ES/${user-cli-arg}/tradester_ES_1s_pl0.25.csv`
  - `data-out/ES/${user-cli-arg}/tradester_ES_15s.csv`
  - `data-out/ES/${user-cli-arg}/tradester_ES_500v.csv`
  - `data-out/ES/${user-cli-arg}/tradester_ES_5m.csv`
  - `data-out/ES/${user-cli-arg}/tradester_ES_1d.csv`
- Include a run manifest alongside output:
  - `data-out/<symbol>/${user-cli-arg}/manifest.json`
  - generated file paths
  - Sierra file paths
  - row counts
  - timestamp mode
  - appended `tradester_` columns per file
  - validation summary

## Tests

- Unit-test extracting zero, one, and many `tradester_` columns.
- Unit-test non-`tradester_` Sierra columns are ignored.
- Unit-test output headers preserve our columns first and append study columns after.
- Unit-test no output is published when validation fails.
- Unit-test temp-file rename behavior.
- Integration-test final output for all five timeframes using fixture Sierra exports.

## Done Criteria

- Final output is written only after all required validations pass.
- Output contains our generated bar columns plus only `tradester_` Sierra columns.
- Output row count equals validated generated row count for each file.
- Manifest documents what was validated and appended.
- Agent marks checkpoint ready for human review with output paths and manifest summary.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- Whether all-or-nothing output should apply across all five files. My recommendation: yes, because downstream consumers should not see a partially validated run.
- Whether the manifest is required. My recommendation: yes, because it makes human review and debugging much easier.
