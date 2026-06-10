import { join, resolve } from 'node:path';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import {
	DATA_IN_ROOT,
	DATA_OUT_ROOT,
	DATA_TEMP_ROOT,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_CHARTBOOK_FILE_NAME,
	SIERRA_SOURCE_ROOT
} from './constants.ts';

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
	const prefix = `tradester_${config.symbolId}`;
	const inputDir = resolve(DATA_IN_ROOT, config.symbolId);

	return {
		bridgeSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_BRIDGE_FILE_NAME),
		chartbookScidFileName: chartbookScidFileName(symbol),
		chartbookSourcePath: resolve(
			SIERRA_SOURCE_ROOT,
			SIERRA_CHARTBOOK_FILE_NAME
		),
		files: {
			daily: join(inputDir, `${prefix}_1d.csv`),
			minutes5: join(inputDir, `${prefix}_5m.csv`),
			priceLevel: join(inputDir, `${prefix}_1s_pl0.25.csv`),
			scid: join(inputDir, `${prefix}.scid`),
			seconds15: join(inputDir, `${prefix}_15s.csv`),
			volume500: join(inputDir, `${prefix}_500v.csv`)
		},
		inputDir,
		outputDir: resolve(DATA_OUT_ROOT, config.symbolId),
		tempDir: resolve(DATA_TEMP_ROOT, config.symbolId)
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
