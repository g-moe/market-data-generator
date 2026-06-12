import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runSierraSync } from '../../../sierra-sync/sierra-sync.ts';
import { findSymbol, getSymbolConfig } from '../../../contracts/symbols.ts';
import { sierraSyncPaths } from '../../../sierra-sync/paths.ts';
import { getTimeframes } from '../../../contracts/index.ts';

describe('sierra-sync e2e', () => {
	it('implements the Sierra sync spec: close, copy, open, wait, validate/write', async () => {
		const rawSymbol = process.env.E2E_SYMBOL ?? 'ES';
		const symbol = findSymbol(rawSymbol);

		if (symbol === undefined) {
			throw new Error(`Unknown symbol: ${rawSymbol}`);
		}

		const expectedPaths = sierraSyncPaths(symbol);

		// Spec step 1-5 are executed by runSierraSync:
		// 1) close Sierra
		// 2) copy bridge/scid/chartbook into Sierra
		// 3) open Sierra
		// 4) wait for data-out-temp export files
		// 5) validate and write data-out with calc__ columns
		const result = await runSierraSync(rawSymbol);

		expect(result.inputDir).toBe(expectedPaths.inputDir);
		expect(result.outputDir).toBe(expectedPaths.outputDir);
		expect(result.tempDir).toBe(expectedPaths.tempDir);

		// Wait-for-export verification (step 4)
		const tempFiles = await readdir(result.tempDir);
		expect(tempFiles.length).toBeGreaterThan(0);

		// Verify merge writes output files into data-out/symbol/
		const outputFiles = await readdir(result.outputDir);
		const symbolId = getSymbolConfig(symbol).symbolId;
		expect(outputFiles.length).toBeGreaterThan(0);

		for (const timeframe of getTimeframes(symbol)) {
			const expectedOutputFileName = basename(expectedPaths.files.timeframes[timeframe.key]);
			const expectedJsonFileName = expectedOutputFileName.replace(/\.csv$/u, '.json');
			const outputFile = join(result.outputDir, expectedOutputFileName);
			const jsonFile = join(result.outputDir, expectedJsonFileName);

			expect(outputFiles).toContain(expectedOutputFileName);
			expect(outputFiles).toContain(expectedJsonFileName);

			const csvHeader = (await readFile(outputFile, 'utf8')).split(/\r?\n/u)[0] ?? '';
			const calculationsJson = JSON.parse(await readFile(jsonFile, 'utf8')) as {
				indicators: unknown[];
				symbol: string;
				timeframe: string;
			};

			expect(calculationsJson.symbol).toBe(symbolId);
			expect(calculationsJson.timeframe).toBe(timeframe.suffix);
			expect(Array.isArray(calculationsJson.indicators)).toBe(true);
			expect(calculationsJson.indicators.length).toBeGreaterThanOrEqual(
				csvHeader.includes('calc__') ? 1 : 0
			);
		}
	});
});
