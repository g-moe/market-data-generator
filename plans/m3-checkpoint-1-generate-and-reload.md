# M3 Checkpoint 1 Plan: Generate Data And Force Sierra Reload

## Checkpoint

Running `generate:sierra` generates data and forces Sierra to reload.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Plain-English Outcome

A single command runs our existing generator, writes the generated files, tells Sierra Chart to reload the new local `.scid` data, and leaves enough evidence that Sierra received the reload request.

## Researched Facts

- Current repo commands are generation-only: `generate`, `generate:without`, `dev`, `test`, `test:e2e`, `check`, `lint`, `format`, and `knip`.
- Current generator writes under the legacy `data/<symbol>` layout; the required target layout is generated input under `data-in/<symbol>` and validated Sierra output under `data-out/<symbol>/${user-cli-arg}`.
- Sierra's `Chart >> Reload and Recalculate` reloads data from the local chart data file and recalculates studies without requesting remote historical data: https://www.sierrachart.com/index.php?page=doc%2FChartMenu.html
- Sierra's `Edit >> Reload Intraday Charts` and `Edit >> Reload All Charts` reload local-drive chart data for open charts: https://www.sierrachart.com/index.php?page=doc%2FEditMenu.html
- Local ACSIL source exposes reload hooks: `FlagToReloadChartData`, `RecalculateChart`, and `RecalculateChartImmediate` in `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\ACS_Source\sierrachart.h`.
- `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\ACS_Source\ACSILCustomChartBars_Example.cpp` uses `sc.FlagToReloadChartData = true`.
- A targeted search of `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\DEV - SC` found no existing reload/export implementation, so assume we need a small Sierra-side bridge unless hidden code appears.

## Gut Decisions

- Sierra-side bridge source lives in this repo only, under `src-sierra-cpp`, and `generate:sierra` copies it into Sierra's `ACS_Source` folder before writing the request.
- Data directories are fixed as `data-in/<symbol>` and `data-out/<symbol>/${user-cli-arg}`.
- Exact request/acknowledgement filenames can be decided during implementation.
- Add a new `generate:sierra` flow without replacing existing generation commands.
- Keep normal generation callable in isolation.
- Treat this repo as the source of truth for both the Node/TypeScript orchestrator and the Sierra/ACSIL bridge source.
- Use a file-based handshake instead of UI automation.
- Prefer ACSIL over menu automation because it is deterministic, testable by file timestamps, and supported by Sierra's own local examples.
- If the bridge cannot be built in this milestone, fallback is a documented manual reload step, but that should be treated as temporary and not checkpoint-complete.

## Implementation Shape

### TypeScript repo

- Add `src/generate:sierra/` for orchestration.
- Add `src/run-generate:sierra.ts` and `src/run-generate:sierra-without-cli.ts` or equivalent names consistent with the final file organization.
- Add package scripts: `generate:sierra` and `generate:sierra:without`.
- Reuse the generation argument model and add Sierra-specific options only where needed:
  - `sierraInstallDir`, default `C:\Trading Software\DEV-Sierra-Chart\Sierra Chart`
  - `acsSourceDir`, default `${sierraInstallDir}\ACS_Source`
  - `sierraDataDir`, default `${sierraInstallDir}\Data`
  - `outputRootIn`, default `data-in`
  - `outputRootOut`, default `data-out`
  - `syncRunId`, default generated timestamp/uuid
  - `reloadTimeoutMs`, default `60_000`
- Generation output for this flow should write `tradester_ES.scid` and derived CSVs into `data-in/<symbol>`.
- Before writing the request, copy `src-sierra-cpp/tradester_sync_bridge.cpp` to `${acsSourceDir}\tradester_sync_bridge.cpp`.
- After generation, write `tradester-sync-request.json` into the Sierra Data folder with run id, symbol, generated SCID path, expected chart names, requested export paths, copied bridge path, and UTC preference.

### Sierra side

- Add a small ACSIL controller study source file in `src-sierra-cpp`; `generate:sierra` installs a copy into Sierra's `ACS_Source` folder so Sierra can build/select it.
- It should detect the request file, reload chart data, recalculate, export bar/study data, and write an acknowledgement file.
- For checkpoint 1, acknowledgement can be minimal: chart name, run id, reload started/completed timestamp, and export path.

## Tests

- Unit-test input normalization for `generate:sierra` args.
- Unit-test request-file construction and bridge source copy into `ACS_Source`.
- Unit-test normal generation still runs independently.
- Integration-test a fake Sierra bridge: generate data, write request file, fake acknowledgement, assert `generate:sierra` waits for and accepts it.

## Done Criteria

- `pnpm generate:sierra ...` generates the expected `.scid` and CSV files.
- Existing `pnpm generate` and `pnpm generate:without` still work independently.
- Sierra bridge source is copied to the configured `ACS_Source` directory.
- Sierra reload request is written to the configured Sierra Data directory and reports the copied bridge path.
- Sierra-side acknowledgement proves the reload path was triggered.
- Agent marks checkpoint ready for human review with command output and file paths.
- Human reviews and accepts before checkpoint is complete.

## Things We Need To Align On Before Implementation

- Final command names: `generate:sierra` / `generate:sierra:without` are my recommendation.
