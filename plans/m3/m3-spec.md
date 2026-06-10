# Milestone 3: Sierra Sync Spec

## Plain-English Goal

Run our market data generation on the Windows VM, make Sierra Chart reload the generated `.scid` files, read Sierra's exported chart data, and prove that Sierra's bars match our generated bars.

The pass condition is simple: for every generated bar file we validate, our `open`, `high`, `low`, `close`, and `volume` values must match Sierra's `Open`, `High`, `Low`, `Last`, and `Volume` values for the same bar sequence.

After validation passes, write our generated rows to `data-out/<symbol>/${user-cli-arg}` with Sierra study columns appended using a `tradester_` prefix.

## Milestone Checkpoints

These checkpoints are the main control points for the milestone. An agent may mark a checkpoint as ready for review only after implementation and verification are complete, but the checkpoint is not complete until a human reviews and accepts it.

1. Running `generate:sierra` generates data and forces Sierra to reload.
2. After reload, the sync detects fresh Sierra `.txt` exports.
3. 1-second OHLCV bars match Sierra's OHLCV bars.
4. 15-second, 5-minute, 500-volume, and 1-day bars match Sierra's OHLCV bars.
5. Validated output is written to `data-out/<symbol>/${user-cli-arg}` with `tradester_` study columns appended.

## End-to-End Flow

1. Run the new `generate:sierra` flow from the Windows VM.
2. `generate:sierra` runs the existing generation code and writes normal generated inputs to `data-in`.
3. Sierra Chart reloads the charts that consume the newly generated `.scid` data.
4. Sierra exports chart bars and study data to `.txt` files in its Data directory.
5. `generate:sierra` waits until Sierra has written a fresh export file for every generated timeframe we need to validate.
6. For each generated CSV, find the matching Sierra export and skip Sierra rows until the first generated bar timestamp is found.
7. Starting at that timestamp, compare each generated bar to the matching Sierra bar in order.
8. If all compared bars match, write merged output to `data-out/<symbol>/${user-cli-arg}`.
9. If any required file is missing, the start timestamp is never found, or any bar does not match, hard fail with a descriptive error.

## Data Directories

- Generated input data: `data-in/<symbol>`
- Validated merged output data: `data-out/<symbol>/${user-cli-arg}`
- Sierra Chart data directory: `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\Data`
- Sierra Chart development resources: `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\DEV - SC`

## Files To Validate

The sync should validate every generated bar file that has a Sierra chart export:

- 1 second
- 15 seconds
- 5 minutes
- 500 volume
- 1 day

Sierra export filenames should follow the chart names shown in Sierra. Confirm the exact on-disk filenames during planning because Sierra may add suffixes such as study, region, or graph-data markers:

| Our file                     | Sierra chart name                | Expected Sierra export pattern              | Bar type   |
| ---------------------------- | -------------------------------- | ------------------------------------------- | ---------- |
| `tradester_ES_1s_pl0.25.csv` | `tradester_ES 1 Sec #1 L:1`      | `tradester_ES 1 Sec #1*_GraphData.txt`      | 1 second   |
| `tradester_ES_15s_*.csv`     | `tradester_ES 15 Sec #2 L:1`     | `tradester_ES 15 Sec #2*_GraphData.txt`     | 15 seconds |
| `tradester_ES_500v.csv`      | `tradester_ES 500 Volume #3 L:1` | `tradester_ES 500 Volume #3*_GraphData.txt` | 500 volume |
| `tradester_ES_5m.csv`        | `tradester_ES 5 Min #4 L:1`      | `tradester_ES 5 Min #4*_GraphData.txt`      | 5 minutes  |
| `tradester_ES_1d.csv`        | `tradester_ES 1 Day #5 L:1`      | `tradester_ES 1 Day #5*_GraphData.txt`      | 1 day      |

## Sierra Export Shape

Example Sierra export file:

```txt
Date, Time, Open, High, Low, Last, Volume, # of Trades, OHLC Avg, HLC Avg, HL Avg, Bid Volume, Ask Volume, tradester_indicatorId1, tradester_indicatorId2, tradester_indicatorIdEtc
```

Rules:

- Sierra `Last` maps to our `close`.
- Sierra `Bid Volume` and `Ask Volume` are ignored for this milestone.
- Study columns are kept for output and must be appended to our rows with their `tradester_` names preserved.
- Only Sierra columns with a `tradester_` prefix are appended to final output. All other non-validation Sierra columns are ignored.

## Our Generated CSV Shape

Example generated file:

```csv
id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap
```

Rules:

- `time` is the generated bar timestamp used to find the starting Sierra row.
- `id` and `pos` are our internal fields and are not compared to Sierra.
- `bidVolume`, `askVolume`, and `vwap` are retained in our output, but they are not part of the Sierra equality check for this milestone.

## Validation Rules

For each file pair:

1. Read Sierra rows in order.
2. Skip rows until Sierra's timestamp equals the first timestamp in our generated CSV.
3. Once the first matching timestamp is found, enter compare mode.
4. Compare rows one-for-one in order.
5. Validate only these fields:

| Our field | Sierra field |
| --------- | ------------ |
| `open`    | `Open`       |
| `high`    | `High`       |
| `low`     | `Low`        |
| `close`   | `Last`       |
| `volume`  | `Volume`     |

Hard fail when:

- A required Sierra export file is not found within the wait window.
- A Sierra export file exists but was not freshly written for this run.
- The first generated timestamp is never found in the Sierra file.
- Sierra has fewer rows than our generated file after compare mode starts.
- Any compared OHLCV value differs.

Failure messages should include:

- Our CSV path
- Sierra export path
- Our timestamp, preferably both raw `time` and formatted date/time if available
- Sierra `Date` and `Time`
- Field name
- Expected value
- Actual value

## Output Rules

When validation passes, write merged rows to `data-out/<symbol>/${user-cli-arg}`.

The output row should start with our generated CSV columns, then append Sierra study columns:

```csv
id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap,tradester_indicatorId1,tradester_indicatorId2
```

Do not write partially validated output. A file should only be written after its full bar sequence passes validation.

## Code Organization Requirements

The Sierra-specific flow must be isolated from normal generation.

Normal generation should still run independently and should not depend on Sierra Chart, Sierra file paths, or Sierra export parsing.

Expected structure:

```txt
src/
  md-generation/
  generate:sierra/
  shared/
    cli/
    io/
  contracts/
    md-generation/
    generate:sierra/
    shared/
```

Both generation flows should support CLI and non-CLI entry points:

1. `md-generation`
2. `generate:sierra`

The CLI and non-CLI versions should share the same argument model.

## Testing Strategy

Use TDD. Keep tests high-signal and focused on the milestone checkpoints.

Test the logic with unit tests:

- Sierra export parsing
- File freshness detection
- Generated-file to Sierra-file matching
- Timestamp start detection
- OHLCV comparison
- Error messages for missing files, missing start timestamp, short Sierra files, and value mismatches
- Output row construction with appended `tradester_` columns

Add an integration test that follows the milestone flow in steps, using the existing generation integration-test pattern where possible.

## Planning Decisions And Research Items

These decisions replace the original open questions:

1. Sierra export file mapping should be based on the Sierra chart names shown in the chartbook: `tradester_ES 1 Sec #1 L:1`, `tradester_ES 15 Sec #2 L:1`, `tradester_ES 500 Volume #3 L:1`, `tradester_ES 5 Min #4 L:1`, and `tradester_ES 1 Day #5 L:1`. Sierra writes bar and study data using similar names, so planning should confirm the exact exported `.txt` filenames from the Data directory.
2. The Sierra reload trigger must be researched before implementation. Check the local Sierra development directory first, then verify against online Sierra Chart documentation or support resources. Local path: `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\DEV - SC`.
3. Timestamp matching must be decided during planning. Sierra is expected to be using either UTC+0 or Chicago time; implementation should prove which one by comparing known generated bar times against Sierra `Date` + `Time` exports.
4. OHLCV comparison should use exact precision by default. If exact comparison proves unreliable because of Sierra formatting or rounding, pause and re-evaluate the precision rule before loosening validation.
5. Sierra `Bid Volume` and `Ask Volume` are ignored for this milestone.
6. Final output appends only Sierra columns whose names start with `tradester_`. These columns are appended to our generated CSV rows after our existing columns.
