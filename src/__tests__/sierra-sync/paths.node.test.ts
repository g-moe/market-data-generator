import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	DATA_IN_ROOT,
	DATA_OUT_ROOT,
	DATA_OUT_TEMP_ROOT,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_CHARTBOOK_FILE_NAME,
	SIERRA_SOURCE_ROOT
} from '../../sierra-sync/constants.ts';
import { getTimeframe, getTimeframes } from '../../contracts/index.ts';
import { sierraExportFileName, sierraSyncPaths } from '../../sierra-sync/paths.ts';

describe('sierraSyncPaths', () => {
	it('builds shared and per-symbol file paths', () => {
		const paths = sierraSyncPaths('/ES:XCME');

		expect(paths).toMatchObject({
			bridgeSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_BRIDGE_FILE_NAME),
			chartbookSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_CHARTBOOK_FILE_NAME),
			inputDir: resolve(DATA_IN_ROOT, 'ES'),
			outputDir: resolve(DATA_OUT_ROOT, 'ES'),
			tempDir: resolve(DATA_OUT_TEMP_ROOT, 'ES')
		});
		expect(paths.files.metadata).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES.json'));
		expect(paths.files.timeframes).toEqual({
			'100t': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_100t.csv'),
			'10r': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_10r.csv'),
			'15s': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_15s.csv'),
			'1d': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1d.csv'),
			'1s': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1s.csv'),
			'500v': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_500v.csv'),
			'5m': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_5m.csv')
		});
		expect(paths.files.scids).toEqual({
			'100t': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_100t.scid'),
			'10r': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_10r.scid'),
			'15s': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_15s.scid'),
			'1d': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1d.scid'),
			'1s': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1s.scid'),
			'500v': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_500v.scid'),
			'5m': resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_5m.scid')
		});
		expect(paths.scidFileNames).toEqual({
			'100t': 'tradester_ES_100t.scid',
			'10r': 'tradester_ES_10r.scid',
			'15s': 'tradester_ES_15s.scid',
			'1d': 'tradester_ES_1d.scid',
			'1s': 'tradester_ES_1s.scid',
			'500v': 'tradester_ES_500v.scid',
			'5m': 'tradester_ES_5m.scid'
		});
	});

	it('builds Sierra bridge export names by suffix', () => {
		expect(sierraExportFileName('/ES:XCME', getTimeframe('/ES:XCME', '15s'))).toBe(
			'tradester_ES_15s_GraphData.txt'
		);
		expect(sierraExportFileName('/ES:XCME', getTimeframe('/ES:XCME', '10r'))).toBe(
			'tradester_ES_10r_GraphData.txt'
		);
		expect(sierraExportFileName('/ES:XCME', getTimeframe('/ES:XCME', '100t'))).toBe(
			'tradester_ES_100t_GraphData.txt'
		);
		expect(sierraExportFileName('/ES:XCME', getTimeframe('/ES:XCME', '1d'))).toBe(
			'tradester_ES_1d_GraphData.txt'
		);
	});

	it('builds the 1s timeframe suffix from symbol tick size', () => {
		const seconds1 = getTimeframes('/ES:XCME').find((timeframe) => timeframe.key === '1s');

		expect(seconds1?.suffix).toBe('1s');
	});
});
