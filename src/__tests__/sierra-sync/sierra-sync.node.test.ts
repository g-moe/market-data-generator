import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GenerationResult } from '../../contracts/types.ts';
import { SIERRA_SYNC_REQUEST_FILE } from '../../sierra-sync/constants.ts';
import { createSierraSyncRequest } from '../../sierra-sync/request.ts';
import { runSierraSync } from '../../sierra-sync/sierra-sync.ts';

const GENERATED_FILES = {
	daily: join('data-in', 'ES', 'tradester_ES_1d.csv'),
	minutes5: join('data-in', 'ES', 'tradester_ES_5m.csv'),
	priceLevel: join('data-in', 'ES', 'tradester_ES_1s_pl0.25.csv'),
	scid: join('data-in', 'ES', 'tradester_ES.scid'),
	seconds15: join('data-in', 'ES', 'tradester_ES_15s.csv'),
	volume500: join('data-in', 'ES', 'tradester_ES_500v.csv')
};

describe('createSierraSyncRequest', () => {
	it('builds the Sierra reload request from generation output', () => {
		const request = createSierraSyncRequest({
			bridgeDllPaths: [join('Data', 'tradester_sync_bridge_ARM64.dll')],
			bridgeInstalledPath: join('ACS_Source', 'tradester_sync_bridge.cpp'),
			bridgeSourcePath: join('src-sierra-cpp', 'tradester_sync_bridge.cpp'),
			dataOutTempDir: join('data-out-temp', 'ES', 'run-1'),
			generation: generationResult(),
			requestedAt: new Date('2026-06-09T18:00:00.000Z'),
			runId: 'run-1'
		});

		expect(request).toMatchObject({
			bridgeDllPaths: [join('Data', 'tradester_sync_bridge_ARM64.dll')],
			generatedFiles: GENERATED_FILES,
			requestedAt: '2026-06-09T18:00:00.000Z',
			runId: 'run-1',
			symbol: '/ES:XCME',
			symbolId: 'ES',
			useUtcTime: true
		});
		expect(request.chartNames).toEqual({
			daily: 'tradester_ES 1 Day #5 L:1',
			minutes5: 'tradester_ES 5 Min #4 L:1',
			priceLevel: 'tradester_ES 1 Sec #1 L:1',
			seconds15: 'tradester_ES 15 Sec #2 L:1',
			volume500: 'tradester_ES 500 Volume #3 L:1'
		});
		expect(request.exportFiles).toEqual({
			daily: 'tradester_ES_1d_GraphData.txt',
			minutes5: 'tradester_ES_5m_GraphData.txt',
			priceLevel: 'tradester_ES_1s_GraphData.txt',
			seconds15: 'tradester_ES_15s_GraphData.txt',
			volume500: 'tradester_ES_500v_GraphData.txt'
		});
	});
});

describe('runSierraSync', () => {
	it('generates into data-in/symbol, builds the bridge DLLs, and writes the Sierra request file', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-sync-'));
		const bridgeSourcePath = join(
			root,
			'src-sierra-cpp',
			'tradester_sync_bridge.cpp'
		);
		const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
		const sierraDataDir = join(root, 'Sierra Chart', 'Data');
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
					dataOutTempRoot: join(root, 'data-out-temp'),
					sierraDataDir,
					symbol: 'ES',
					syncRunId: 'review-run'
				},
				{
					buildSierraBridge: async () => bridgeDllPaths,
					generate: async (inputs) => generationResult(inputs.outputDir),
					now: () => new Date('2026-06-09T18:00:00.000Z')
				}
			);

			expect(result.generation.inputs.outputDir).toBe(
				join(root, 'data-in', 'ES')
			);
			expect(result.outputDir).toBe(join(root, 'data-out', 'ES', 'review-run'));
			expect(result.bridgeInstalledPath).toBe(
				join(acsSourceDir, 'tradester_sync_bridge.cpp')
			);
			await expect(readFile(result.bridgeInstalledPath, 'utf8')).resolves.toBe(
				'bridge source'
			);
			expect(result.bridgeDllPaths).toEqual(bridgeDllPaths);
			expect(result.requestPath).toBe(
				join(sierraDataDir, SIERRA_SYNC_REQUEST_FILE)
			);
			expect(
				JSON.parse(await readFile(result.requestPath, 'utf8'))
			).toMatchObject({
				bridgeDllPaths,
				dataOutTempDir: join(root, 'data-out-temp', 'ES', 'review-run'),
				runId: 'review-run',
				symbolId: 'ES'
			});
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
