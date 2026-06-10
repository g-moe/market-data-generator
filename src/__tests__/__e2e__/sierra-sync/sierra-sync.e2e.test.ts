import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SIERRA_CHARTBOOK_FILE_NAME } from '../../../sierra-sync/constants.ts';
import { sierraExportFileName } from '../../../sierra-sync/paths.ts';
import { runSierraSync } from '../../../sierra-sync/sierra-sync.ts';
import type { SierraOps } from '../../../sierra-sync/sierra-ops.ts';

const CANDLE_HEADER =
	'id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap';
const SIERRA_HEADER =
	'Date, Time, Open, High, Low, Last, Volume, # of Trades, OHLC Avg, HLC Avg, HL Avg, Bid Volume, Ask Volume, tradester_signal';
const ROW_TIME = Date.UTC(2026, 5, 6, 2, 0, 4);
const GENERATED_ROW = `id,${ROW_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25`;
const SIERRA_ROW =
	'2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, ok';

let previousCwd = process.cwd();

afterEach(() => {
	process.chdir(previousCwd);
});

describe('Sierra sync flow', () => {
	it('runs the real orchestration with fake Sierra operations and writes merged time-bar output', async () => {
		previousCwd = process.cwd();
		const root = await mkdtemp(join(tmpdir(), 'sierra-sync-e2e-'));
		process.chdir(root);

		try {
			await writeInputFiles(root);
			const calls: string[] = [];
			const ops = createFakeSierraOps(calls);
			const logs: string[] = [];

			const result = await runSierraSync('ES', {
				log: (message) => logs.push(message),
				ops
			});

			expect(calls).toEqual([
				'cleanTempDir',
				'closeSierra',
				'installBridgeSource',
				'buildBridge',
				'copyScid',
				'copyChartbook',
				'openSierra',
				'waitForFiles'
			]);
			expect(logs).toContain('Validating Sierra OHLCV and writing data-out');
			expect(result.tempDir).toBe(join(root, 'data-out-temp', 'ES'));
			await expect(
				readFile(join(root, 'data-out', 'ES', 'tradester_ES_5m.csv'), 'utf8')
			).resolves.toBe(
				`${CANDLE_HEADER},tradester_signal\n${GENERATED_ROW},ok\n`
			);
			await expect(
				readFile(join(root, 'data-out', 'ES', 'tradester_ES_15s.csv'), 'utf8')
			).resolves.toBe(
				`${CANDLE_HEADER},tradester_signal\n${GENERATED_ROW},ok\n`
			);
			await expect(
				readFile(
					join(root, 'data-out', 'ES', 'tradester_ES_1s_pl0.25.csv'),
					'utf8'
				)
			).resolves.toBe(
				`${CANDLE_HEADER},tradester_signal\n${GENERATED_ROW},ok\n`
			);
		} finally {
			process.chdir(previousCwd);
			await rm(root, { force: true, recursive: true });
		}
	});
});

async function writeInputFiles(root: string) {
	const inputDir = join(root, 'data-in', 'ES');
	const sourceDir = join(root, 'src-sierra-cpp');
	await mkdir(inputDir, { recursive: true });
	await mkdir(sourceDir, { recursive: true });

	await Promise.all([
		writeFile(join(sourceDir, SIERRA_CHARTBOOK_FILE_NAME), 'chartbook'),
		writeFile(join(inputDir, 'tradester_ES.scid'), 'scid'),
		writeGeneratedCsv(join(inputDir, 'tradester_ES_1d.csv')),
		writeGeneratedCsv(join(inputDir, 'tradester_ES_5m.csv')),
		writeGeneratedCsv(join(inputDir, 'tradester_ES_15s.csv')),
		writeGeneratedCsv(join(inputDir, 'tradester_ES_500v.csv')),
		writeGeneratedCsv(join(inputDir, 'tradester_ES_1s_pl0.25.csv'))
	]);
}

function writeGeneratedCsv(filePath: string) {
	return writeFile(filePath, `${CANDLE_HEADER}\n${GENERATED_ROW}\n`);
}

function createFakeSierraOps(calls: string[]): SierraOps {
	return {
		async buildBridge() {
			calls.push('buildBridge');
		},
		async cleanTempDir(directory) {
			calls.push('cleanTempDir');
			await rm(directory, { force: true, recursive: true });
			await mkdir(directory, { recursive: true });
		},
		async closeSierra() {
			calls.push('closeSierra');
		},
		async copyChartbook() {
			calls.push('copyChartbook');
			return 'chartbook-path';
		},
		async copyScid() {
			calls.push('copyScid');
			return 'scid-path';
		},
		async installBridgeSource(source) {
			calls.push('installBridgeSource');
			expect(source).toContain('tradester_ES');
			return 'bridge-path';
		},
		async openSierra() {
			calls.push('openSierra');
		},
		async waitForFiles(directory, fileNames) {
			calls.push('waitForFiles');
			expect(fileNames).toEqual([
				sierraExportFileName('/ES:XCME', '5m'),
				sierraExportFileName('/ES:XCME', '15s'),
				sierraExportFileName('/ES:XCME', '500v'),
				sierraExportFileName('/ES:XCME', '1s_pl0.25')
			]);
			await Promise.all(
				fileNames.map((fileName) =>
					writeFile(
						join(directory, fileName),
						`${SIERRA_HEADER}\n${SIERRA_ROW}\n`
					)
				)
			);
		}
	};
}
