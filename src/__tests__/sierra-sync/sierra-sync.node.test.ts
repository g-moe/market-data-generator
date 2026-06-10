import {
	mkdir,
	readFile,
	rm,
	utimes,
	writeFile
} from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_OUTPUT_ROOT } from '../../contracts/defaults.ts';
import {
	DEFAULT_DATA_OUT_ROOT,
	DEFAULT_DATA_OUT_TEMP_ROOT,
	SIERRA_BRIDGE_DLL_BASE_NAME,
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_BRIDGE_SOURCE_DIR,
	SIERRA_LATEST_RUN_NAME
} from '../../sierra-sync/constants.ts';
import type { GenerationResult } from '../../contracts/types.ts';
import {
	latestSierraOutputDir,
	sierraExportFiles
} from '../../sierra-sync/outputs.ts';
import { runSierraSync } from '../../sierra-sync/sierra-sync.ts';

const GENERATED_TIME = Date.UTC(2026, 5, 9, 18, 0, 4);
const GENERATED_ROW = `${GENERATED_TIME.toString()}000000,${GENERATED_TIME.toString()},0,4330,4331,4329,4330.5,12,12,0,4330.5`;
const GENERATED_PRICE_LEVEL_ROW = `${GENERATED_ROW},4330.5:12`;
const CANDLE_HEADER =
	'id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap';
const PRICE_LEVEL_HEADER = `${CANDLE_HEADER},prices`;
const SIERRA_PRICE_LEVEL_EXPORT =
	'DateTime\tOpen\tHigh\tLow\tLast\tVolume\tNumberOfTrades\tBidVolume\tAskVolume\n' +
	'2026-06-09\t13:00:04\t4330\t4331\t4329\t4330.5\t12\t1\t0\t12\n';

describe('sierra output paths', () => {
	it('uses a fixed latest directory and deterministic Sierra export names', () => {
		expect(
			latestSierraOutputDir({
				dataOutTempRoot: DEFAULT_DATA_OUT_TEMP_ROOT,
				symbol: 'ES'
			})
		).toBe(resolve(DEFAULT_DATA_OUT_TEMP_ROOT, 'ES', SIERRA_LATEST_RUN_NAME));
		expect(sierraExportFiles('/ES:XCME')).toEqual({
			daily: 'tradester_ES_1d_GraphData.txt',
			minutes5: 'tradester_ES_5m_GraphData.txt',
			priceLevel: 'tradester_ES_1s_GraphData.txt',
			seconds15: 'tradester_ES_15s_GraphData.txt',
			volume500: 'tradester_ES_500v_GraphData.txt'
		});
	});
});

describe('runSierraSync', () => {
	it('loads existing data-in files, validates latest exports, and copies them to the named run', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-sync-'));
		const bridgeSourcePath = join(
			root,
			SIERRA_BRIDGE_SOURCE_DIR,
			SIERRA_BRIDGE_FILE_NAME
		);
		const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
		const sierraDataDir = join(root, 'Sierra Chart', 'Data');
		const dataInRoot = join(root, DEFAULT_OUTPUT_ROOT);
		const dataOutTempRoot = join(root, DEFAULT_DATA_OUT_TEMP_ROOT);
		const latestOutputDir = join(dataOutTempRoot, 'ES', SIERRA_LATEST_RUN_NAME);
		const bridgeDllPaths = [
			join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_ARM64.dll`),
			join(sierraDataDir, `${SIERRA_BRIDGE_DLL_BASE_NAME}_64.dll`)
		];

		try {
			await mkdir(join(root, SIERRA_BRIDGE_SOURCE_DIR), { recursive: true });
			await writeFile(bridgeSourcePath, 'bridge source');
			await writeGeneratedFiles(generationResult(join(dataInRoot, 'ES')));
			await mkdir(latestOutputDir, { recursive: true });
			await writeFile(join(latestOutputDir, 'stale.txt'), 'stale');

			const result = await runSierraSync(
				{
					acsSourceDir,
					bridgeSourcePath,
					dataInRoot,
					dataOutRoot: join(root, DEFAULT_DATA_OUT_ROOT),
					dataOutTempRoot,
					exportPollIntervalMs: 5,
					exportTimeoutMs: 500,
					sierraDataDir,
					symbol: 'ES',
					syncRunId: 'review-run'
				},
				{
					buildSierraBridge: async () => {
						await mkdir(latestOutputDir, { recursive: true });

						const exportFiles = sierraExportFiles('/ES:XCME');

						await Promise.all(
							Object.entries(exportFiles).map(([key, fileName]) =>
								writeFile(
									join(latestOutputDir, fileName),
									key === 'priceLevel'
										? SIERRA_PRICE_LEVEL_EXPORT
										: `fresh ${fileName}`
								)
							)
						);

						const freshTime = new Date(Date.now() + 1000);
						await Promise.all(
							Object.values(exportFiles).map((fileName) =>
								utimes(join(latestOutputDir, fileName), freshTime, freshTime)
							)
						);

						return bridgeDllPaths;
					},
					now: () => new Date('2026-06-09T18:00:00.000Z')
				}
			);

			expect(result.generation.inputs.outputDir).toBe(join(dataInRoot, 'ES'));
			expect(result.latestOutputDir).toBe(latestOutputDir);
			expect(result.outputDir).toBe(
				join(root, DEFAULT_DATA_OUT_ROOT, 'ES', 'review-run')
			);
			expect(result.bridgeInstalledPath).toBe(
				join(acsSourceDir, SIERRA_BRIDGE_FILE_NAME)
			);
			await expect(readFile(result.bridgeInstalledPath, 'utf8')).resolves.toBe(
				'bridge source'
			);
			expect(result.bridgeDllPaths).toEqual(bridgeDllPaths);
			expect(result.validation.comparedRows).toBe(1);
			expect(result.validation.firstMatchedTimestamp).toBe(GENERATED_TIME);
			await expect(
				readFile(result.copiedFiles.priceLevel, 'utf8')
			).resolves.toBe(SIERRA_PRICE_LEVEL_EXPORT);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	}, 10_000);
});

async function writeGeneratedFiles(result: GenerationResult) {
	await mkdir(result.inputs.outputDir, { recursive: true });
	await writeFile(result.files.scid, Buffer.alloc(96));
	await writeFile(
		result.files.priceLevel,
		`${PRICE_LEVEL_HEADER}\n${GENERATED_PRICE_LEVEL_ROW}\n`
	);

	await Promise.all(
		[
			result.files.daily,
			result.files.minutes5,
			result.files.seconds15,
			result.files.volume500
		].map((filePath) =>
			writeFile(filePath, `${CANDLE_HEADER}\n${GENERATED_ROW}\n`)
		)
	);
}

function generationResult(
	outputDir = join(DEFAULT_OUTPUT_ROOT, 'ES')
): GenerationResult {
	return {
		counts: {
			daily: 1,
			minutes5: 1,
			priceLevel: 1,
			seconds15: 1,
			ticks: 1,
			volume500: 1
		},
		files: {
			daily: join(outputDir, 'tradester_ES_1d.csv'),
			minutes5: join(outputDir, 'tradester_ES_5m.csv'),
			priceLevel: join(outputDir, 'tradester_ES_1s_pl0.25.csv'),
			scid: join(outputDir, 'tradester_ES.scid'),
			seconds15: join(outputDir, 'tradester_ES_15s.csv'),
			volume500: join(outputDir, 'tradester_ES_500v.csv')
		},
		inputs: {
			anchorIso: '2026-06-05T21:00:00.000Z',
			outputDir,
			outputRoot: join(outputDir, '..'),
			seed: 1,
			sessionCount: 1,
			startPrice: 4330,
			symbol: '/ES:XCME',
			ticksPerSession: 1
		}
	};
}
