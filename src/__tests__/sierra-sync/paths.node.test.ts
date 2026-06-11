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
import { getSymbolConfig, getTimeframes } from '../../contracts/index.ts';
import { sierraExportFileName, sierraSyncPaths } from '../../sierra-sync/paths.ts';

describe('sierraSyncPaths', () => {
	it('builds shared and per-symbol file paths', () => {
		const paths = sierraSyncPaths('/ES:XCME');

		expect(paths).toMatchObject({
			bridgeSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_BRIDGE_FILE_NAME),
			chartbookScidFileName: 'tradester_ES.scid',
			chartbookSourcePath: resolve(SIERRA_SOURCE_ROOT, SIERRA_CHARTBOOK_FILE_NAME),
			inputDir: resolve(DATA_IN_ROOT, 'ES'),
			outputDir: resolve(DATA_OUT_ROOT, 'ES'),
			tempDir: resolve(DATA_OUT_TEMP_ROOT, 'ES')
		});
		expect(paths.files.daily).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1d.csv'));
		expect(paths.files.metadata).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES.json'));
		expect(paths.files.priceLevel).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_1s_pl0.25.csv'));
		expect(paths.files.minutes5).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_5m.csv'));
		expect(paths.files.seconds15).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_15s.csv'));
		expect(paths.files.tick100).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_100t.csv'));
		expect(paths.files.volume500).toBe(resolve(DATA_IN_ROOT, 'ES', 'tradester_ES_500v.csv'));
	});

	it('builds Sierra bridge export names by suffix', () => {
		expect(sierraExportFileName('/ES:XCME', '15s')).toBe('tradester_ES_15s_GraphData.txt');
		expect(sierraExportFileName('/ES:XCME', '100t')).toBe('tradester_ES_100t_GraphData.txt');
		expect(sierraExportFileName('/ES:XCME', '1d')).toBe('tradester_ES_1d_GraphData.txt');
	});

	it('builds the price-level timeframe suffix from symbol tick size', () => {
		const config = getSymbolConfig('/ES:XCME');
		const priceLevel = getTimeframes('/ES:XCME').find(
			(timeframe) => timeframe.key === 'priceLevel'
		);

		expect(priceLevel?.suffix).toBe(`1s_pl${config.tickSize}`);
	});
});
