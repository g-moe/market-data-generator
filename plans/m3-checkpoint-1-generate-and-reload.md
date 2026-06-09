# M3 Checkpoint 1 Plan: Generate And Reload Sierra

## Checkpoint

`generate:sierra` prepares normal generated input data, materializes the Sierra bridge source, builds the bridge DLLs, and leaves Sierra responsible only for exporting chart data through ACSIL.

An agent can mark this checkpoint ready for review after implementation and verification, but a human must review and accept it before the checkpoint is complete.

## Status

Complete and human-reviewed as of the current Sierra flow.

## Plain-English Outcome

Running `generate:sierra` asks for a symbol and run name, writes generated market data to `data-in/<symbol>`, copies a materialized C++ study into Sierra's `ACS_Source` folder, builds the Sierra DLLs, and then waits for Sierra chart exports. The C++ study does not read a request file, write an acknowledgement file, or own orchestration state.

## Current Decisions

- Node owns the runtime flow, paths, build command, polling, and copying final outputs.
- Sierra/ACSIL owns only Sierra-specific chart export work.
- Source template stays in `src-sierra-cpp/tradester_sync_bridge.cpp`.
- Materialized source is written to `${acsSourceDir}/tradester_sync_bridge.cpp`.
- Generated input files are written to `data-in/<symbol>`.
- Temporary Sierra exports are written to `data-out-temp/<symbol>/latest`.
- Named run output is copied to `data-out/<symbol>/<run-name>`.
- No `tradester-sync-request.json` or acknowledgement file is part of this flow.

## Implementation Shape

- Keep orchestration under `src/sierra-sync/`.
- Keep package scripts `generate:sierra` and `generate:sierra:without`.
- `installSierraBridgeSource` injects the runtime latest export directory into the C++ template before copying it to Sierra `ACS_Source`.
- `buildSierraBridge` sends Sierra unload/reload UDP messages and builds both ARM64 and x64 DLLs into Sierra `Data`.
- The C++ bridge writes deterministic Sierra export filenames for the configured chart numbers.

## Verified

- `pnpm run test:e2e:sierra` passed against real Sierra.
- `pnpm test -- --run src/__tests__/sierra-sync` passed after adding bridge coverage.
- `pnpm run format:check`, `pnpm run lint`, `pnpm run check`, and `pnpm run knip` previously passed for the current flow.

## Done Criteria

- `generate:sierra` prompts for a run name.
- Generated input files land under `data-in/<symbol>`.
- Sierra bridge source is copied to the configured `ACS_Source` directory.
- Sierra bridge DLLs build or fail clearly.
- No request/ack files are required.
- Human review accepted this checkpoint.

## Things We Need To Align On Before Implementation

- None. This checkpoint is complete.
