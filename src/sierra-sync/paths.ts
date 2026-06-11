import { resolve } from 'node:path';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/index.ts';
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
	chartbookScidFileName: string;
	files: OutputFiles;
};

export function sierraSyncPaths(symbol: Symbol): SierraSyncPaths {
	const config = getSymbolConfig(symbol);
	const inputDir = resolve(DATA_IN_ROOT, config.symbolId);

	return {
		bridgeSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_BRIDGE_FILE_NAME),
		chartbookScidFileName: chartbookScidFileName(symbol),
		chartbookSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_CHARTBOOK_FILE_NAME),
		files: getOutputFiles(symbol, inputDir),
		inputDir,
		outputDir: resolve(DATA_OUT_ROOT, config.symbolId),
		tempDir: resolve(DATA_OUT_TEMP_ROOT, config.symbolId)
	};
}

export function sierraExportFileName(symbol: Symbol, suffix: string) {
	const config = getSymbolConfig(symbol);

	return `tradester_${config.symbolId}_${suffix}_GraphData.txt`;
}

function chartbookScidFileName(symbol: Symbol) {
	const config = getSymbolConfig(symbol);

	return `tradester_${config.symbolId}.scid`;
}
