import { join } from 'node:path';

import { getSymbolConfig } from '../contracts/symbols.ts';
import type { RawGeneratorInputs } from '../contracts/types.ts';
import { normalizeInputs } from '../md-generation/inputs.ts';
import {
	DEFAULT_DATA_IN_ROOT,
	DEFAULT_DATA_OUT_ROOT,
	DEFAULT_DATA_OUT_TEMP_ROOT,
	DEFAULT_SIERRA_INSTALL_DIR,
	SIERRA_BRIDGE_SOURCE_PATH,
	SIERRA_EXPORT_POLL_INTERVAL_MS,
	SIERRA_EXPORT_TIMEOUT_MS
} from './constants.ts';
import { latestSierraOutputDir } from './outputs.ts';

export type RawSierraSyncInputs = RawGeneratorInputs & {
	dataInRoot?: string;
	dataOutRoot?: string;
	dataOutTempRoot?: string;
	sierraDataDir?: string;
	sierraInstallDir?: string;
	acsSourceDir?: string;
	bridgeSourcePath?: string;
	buildSierraBridge?: boolean;
	syncRunId?: string;
	exportPollIntervalMs?: number;
	exportTimeoutMs?: number;
};

export function normalizeSierraSyncInputs(
	raw: RawSierraSyncInputs,
	now: (() => Date) | undefined
) {
	const dataInRoot = raw.dataInRoot?.trim() || DEFAULT_DATA_IN_ROOT;
	const dataOutRoot = raw.dataOutRoot?.trim() || DEFAULT_DATA_OUT_ROOT;
	const dataOutTempRoot =
		raw.dataOutTempRoot?.trim() || DEFAULT_DATA_OUT_TEMP_ROOT;
	const requestedAt = now?.() ?? new Date();
	const syncRunId = raw.syncRunId?.trim() || createRunId(requestedAt);
	const generationInputs = normalizeInputs({ ...raw, outputDir: dataInRoot });
	const symbolConfig = getSymbolConfig(generationInputs.symbol);
	const sierraInstallDir =
		raw.sierraInstallDir?.trim() || DEFAULT_SIERRA_INSTALL_DIR;
	const sierraDataDir =
		raw.sierraDataDir?.trim() || join(sierraInstallDir, 'Data');
	const acsSourceDir =
		raw.acsSourceDir?.trim() || join(sierraInstallDir, 'ACS_Source');
	return {
		acsSourceDir,
		bridgeSourcePath: raw.bridgeSourcePath?.trim() || SIERRA_BRIDGE_SOURCE_PATH,
		buildSierraBridge: raw.buildSierraBridge ?? true,
		exportPollIntervalMs:
			raw.exportPollIntervalMs ?? SIERRA_EXPORT_POLL_INTERVAL_MS,
		exportTimeoutMs: raw.exportTimeoutMs ?? SIERRA_EXPORT_TIMEOUT_MS,
		generationInputs,
		latestOutputDir: latestSierraOutputDir({
			dataOutTempRoot,
			symbol: generationInputs.symbol
		}),
		outputDir: join(dataOutRoot, symbolConfig.symbolId, syncRunId),
		requestedAt,
		sierraDataDir,
		syncRunId
	};
}

function createRunId(date: Date) {
	return date.toISOString().replaceAll(/[:.]/g, '-');
}
