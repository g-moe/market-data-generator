import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GenerationResult } from '../../contracts/types.ts';
import {
	latestSierraOutputDir,
	sierraExportFiles
} from '../../sierra-sync/outputs.ts';
import { runSierraSync } from '../../sierra-sync/sierra-sync.ts';

const GENERATED_FILES = {
	daily: join('data-in', 'ES', 'tradester_ES_1d.csv'),
	minutes5: join('data-in', 'ES', 'tradester_ES_5m.csv'),
	priceLevel: join('data-in', 'ES', 'tradester_ES_1s_pl0.25.csv'),
	scid: join('data-in', 'ES', 'tradester_ES.scid'),
	seconds15: join('data-in', 'ES', 'tradester_ES_15s.csv'),
	volume500: join('data-in', 'ES', 'tradester_ES_500v.csv')
};

describe('sierra output paths', () => {
	it('uses a fixed latest directory and deterministic Sierra export names', () => {
		expect(
			latestSierraOutputDir({
				dataOutTempRoot: 'data-out-temp',
				symbol: 'ES'
			})
		).toBe(resolve('data-out-temp', 'ES', 'latest'));
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
	it('generates into data-in/symbol, builds the bridge, waits for latest exports, and copies them to the named run', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-sync-'));
		const bridgeSourcePath = join(
			root,
			'src-sierra-cpp',
			'tradester_sync_bridge.cpp'
		);
		const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
		const sierraDataDir = join(root, 'Sierra Chart', 'Data');
		const dataOutTempRoot = join(root, 'data-out-temp');
		const latestOutputDir = join(dataOutTempRoot, 'ES', 'latest');
		const bridgeDllPaths = [
			join(sierraDataDir, 'tradester_sync_bridge_ARM64.dll'),
			join(sierraDataDir, 'tradester_sync_bridge_64.dll')
		];

		try {
			await mkdir(join(root, 'src-sierra-cpp'), { recursive: true });
			await writeFile(bridgeSourcePath, 'bridge source');

			const result = await runSierraSync(
				{
					acsSourceDir,
					bridgeSourcePath,
					dataInRoot: join(root, 'data-in'),
					dataOutRoot: join(root, 'data-out'),
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
						await Promise.all(
							Object.values(sierraExportFiles('/ES:XCME')).map((fileName) =>
								writeFile(join(latestOutputDir, fileName), `fresh ${fileName}`)
							)
						);
						return bridgeDllPaths;
					},
					generate: async (inputs) => generationResult(inputs.outputDir),
					now: () => new Date('2026-06-09T18:00:00.000Z')
				}
			);

			expect(result.generation.inputs.outputDir).toBe(
				join(root, 'data-in', 'ES')
			);
			expect(result.latestOutputDir).toBe(latestOutputDir);
			expect(result.outputDir).toBe(join(root, 'data-out', 'ES', 'review-run'));
			expect(result.bridgeInstalledPath).toBe(
				join(acsSourceDir, 'tradester_sync_bridge.cpp')
			);
			await expect(readFile(result.bridgeInstalledPath, 'utf8')).resolves.toBe(
				'bridge source'
			);
			expect(result.bridgeDllPaths).toEqual(bridgeDllPaths);
			await expect(
				readFile(result.copiedFiles.priceLevel, 'utf8')
			).resolves.toBe('fresh tradester_ES_1s_GraphData.txt');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function generationResult(outputDir = join('data-in', 'ES')): GenerationResult {
	return {
		counts: {
			daily: 1,
			minutes5: 1,
			priceLevel: 1,
			seconds15: 1,
			ticks: 1,
			volume500: 1
		},
		files: GENERATED_FILES,
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
