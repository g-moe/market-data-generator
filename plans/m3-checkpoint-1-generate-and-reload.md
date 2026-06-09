# M3 Checkpoint 1 Plan: Generate Data And Force Sierra Reload

## Checkpoint

Running `generate:sierra` generates data, installs/builds the Sierra bridge, and gives Sierra the minimal config needed to reload/export.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

A single command runs our generator, writes generated input files under `data-in/<symbol>`, copies/builds the repo-owned ACSIL bridge into Sierra, asks for a run name, and writes a small Sierra request/config file. The C++ bridge should remain thin: it reloads/recalculates and uses Sierra's own ACSIL export function. It should not decide completion.

## Current State

- Implemented command names are `generate:sierra` and `generate:sierra:without`.
- Interactive `generate:sierra` prompts for `Run name:`; that value is the pipeline run id.
- Normal generation for this flow writes into `data-in/<symbol>`.
- The repo-owned Sierra source lives at `src-sierra-cpp/tradester_sync_bridge.cpp`.
- `generate:sierra` copies the bridge source to the configured Sierra `ACS_Source` folder.
- `generate:sierra` can build ARM64 and x64 bridge DLLs into Sierra's Data folder and tells Sierra to release/reload DLLs around the build.
- `data-out-temp/` is ignored and reserved for temporary Sierra exports used by later validation checkpoints.

## Researched Facts

- Sierra's `Chart >> Reload and Recalculate` reloads local chart data and recalculates studies: https://www.sierrachart.com/index.php?page=doc%2FChartMenu.html
- Sierra's `Edit >> Reload Intraday Charts` and `Edit >> Reload All Charts` reload local chart data for open charts: https://www.sierrachart.com/index.php?page=doc%2FEditMenu.html
- Local ACSIL source exposes reload hooks: `FlagToReloadChartData`, `RecalculateChart`, and `RecalculateChartImmediate` in `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\ACS_Source\sierrachart.h`.
- `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\ACS_Source\ACSILCustomChartBars_Example.cpp` uses `sc.FlagToReloadChartData = true`.
- Sierra's `sc.WriteBarAndStudyDataToFile` writes chart bar data and study subgraph data to a complete output path: https://www.sierrachart.com/index.php?page=doc%2FACSIL_Members_Functions.html
- Sierra's `sc.WriteBarAndStudyDataToFileEx` provides additional output controls and is the preferred bridge API if the local Sierra headers support the options we need.

## Gut Decisions

- Keep the Sierra bridge source in this repo only. Sierra receives a copied build input, not the source of truth.
- Keep a tiny request/config file only because ACSIL needs to know the run output directory and deterministic filenames.
- Do not use a Sierra acknowledgement file as the proof of completion.
- Do not custom-write rows in C++ if Sierra's built-in bar/study writer gives the needed output.
- Node/TypeScript owns orchestration, run naming, logging, polling, timeout, and later validation.
- Sierra/ACSIL owns only Sierra-specific actions: reload/recalculate and writing chart exports with standard ACSIL APIs.
- Data directories are fixed as:
  - generated input: `data-in/<symbol>`
  - temporary Sierra exports: `data-out-temp/<symbol>/<run-name>`
  - final validated output: `data-out/<symbol>/<run-name>`

## Implementation Shape

### TypeScript repo

- Keep orchestration under `src/sierra-sync/`.
- Keep package scripts: `generate:sierra` and `generate:sierra:without`.
- Reuse the existing generation argument model and add Sierra-specific options only where needed:
  - `sierraInstallDir`, default `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart`
  - `acsSourceDir`, default `${sierraInstallDir}\ACS_Source`
  - `sierraDataDir`, default `${sierraInstallDir}\Data`
  - `dataInRoot`, default `data-in`
  - `dataOutTempRoot`, default `data-out-temp`
  - `dataOutRoot`, default `data-out`
  - `syncRunId`, supplied by the CLI run-name prompt or a programmatic option
  - `reloadTimeoutMs`, default `60_000`
- Generation output for this flow writes `tradester_ES.scid` and derived CSVs into `data-in/<symbol>`.
- Before writing the request/config, copy `src-sierra-cpp/tradester_sync_bridge.cpp` to `${acsSourceDir}\tradester_sync_bridge.cpp`.
- Build the bridge DLLs by default and include copied source/DLL paths in the run result.
- Write `tradester-sync-request.json` into the Sierra Data folder with run id, symbol, chart mapping, deterministic export paths under `data-out-temp/<symbol>/<run-name>`, copied bridge path, DLL paths, and UTC preference.

### Sierra side

- The bridge should read only the minimal request/config it needs.
- The bridge should reload/recalculate when it sees a new run id.
- The bridge should wait for chart data loading to be complete using standard ACSIL checks before export.
- The bridge should call `sc.WriteBarAndStudyDataToFileEx` or `sc.WriteBarAndStudyDataToFile` with the configured output path.
- The bridge should not write custom bar rows.
- The bridge should not write an acknowledgement file.

## Tests

- Unit-test request/config construction, including deterministic export paths under `data-out-temp/<symbol>/<run-name>`.
- Unit-test bridge source copy into `ACS_Source`.
- Unit-test that normal generation still runs independently.
- Unit-test CLI run-name prompt behavior.
- Keep build orchestration testable with an injected fake bridge build function.

## Done Criteria

- `pnpm generate:sierra` prompts for a run name and generates expected `.scid` and CSV files under `data-in/<symbol>`.
- Existing `pnpm generate` and `pnpm generate:without` still work independently.
- Sierra bridge source is copied to the configured `ACS_Source` directory.
- Sierra bridge DLLs are built or a clear build failure is surfaced.
- Sierra request/config is written to the configured Sierra Data directory and includes deterministic export paths under `data-out-temp/<symbol>/<run-name>`.
- The C++ bridge uses Sierra's ACSIL writer rather than custom row writing.
- Agent marks checkpoint ready for human review with command output and file paths.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- None currently. The open design choices above have been decided for this checkpoint.
