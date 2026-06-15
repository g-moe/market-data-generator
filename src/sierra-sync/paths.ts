import { basename, resolve } from 'node:path';

import type { OutputFiles, ResolvedTimeframe, Symbol, TimeframeKey } from '../contracts/index.ts';
import { createTimeframeRecord, getSymbolConfig } from '../contracts/index.ts';
import {
	DATA_IN_ROOT,
	DATA_OUT_ROOT,
	DATA_OUT_TEMP_ROOT,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_CHARTBOOK_FILE_NAME,
	SIERRA_SOURCE_ROOT
} from './constants.ts';
import { getOutputFiles } from '../shared/output-files.ts';

export type SierraSyncPaths = {
	inputDir: string;
	outputDir: string;
	tempDir: string;
	bridgeSourcePath: string;
	chartbookSourcePath: string;
	files: OutputFiles;
	scidFileNames: Record<TimeframeKey, string>;
};

export function sierraSyncPaths(symbol: Symbol): SierraSyncPaths {
	const config = getSymbolConfig(symbol);
	const inputDir = resolve(DATA_IN_ROOT, config.symbolId);
	const files = getOutputFiles(symbol, inputDir);

	return {
		bridgeSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_BRIDGE_FILE_NAME),
		chartbookSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_CHARTBOOK_FILE_NAME),
		files,
		inputDir,
		outputDir: resolve(DATA_OUT_ROOT, config.symbolId),
		scidFileNames: createTimeframeRecord((key) => basename(files.scids[key])),
		tempDir: resolve(DATA_OUT_TEMP_ROOT, config.symbolId)
	};
}

export function sierraExportFileName(symbol: Symbol, timeframe: Pick<ResolvedTimeframe, 'suffix'>) {
	const config = getSymbolConfig(symbol);

	return `tradester_${config.symbolId}_${timeframe.suffix}_GraphData.txt`;
}
