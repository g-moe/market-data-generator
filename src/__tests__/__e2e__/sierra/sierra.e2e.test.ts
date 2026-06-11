import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runSierraSync } from '../../../sierra-sync/sierra-sync.ts';
import { findSymbol } from '../../../contracts/symbols.ts';
import { sierraSyncPaths } from '../../../sierra-sync/paths.ts';
import { TIMEFRAMES } from '../../../sierra-sync/constants.ts';

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
		// 5) validate and write data-out with tradester_ columns
		const result = await runSierraSync(rawSymbol);

		expect(result.inputDir).toBe(expectedPaths.inputDir);
		expect(result.outputDir).toBe(expectedPaths.outputDir);
		expect(result.tempDir).toBe(expectedPaths.tempDir);

		// Wait-for-export verification (step 4)
		const tempFiles = await readdir(result.tempDir);
		expect(tempFiles.length).toBeGreaterThan(0);

		// Verify merge writes output files into data-out/symbol/
		const outputFiles = await readdir(result.outputDir);
		expect(outputFiles.length).toBeGreaterThan(0);

		for (const timeframe of TIMEFRAMES) {
			const expectedOutputFileName = basename(
				expectedPaths.files[timeframe.key as keyof typeof expectedPaths.files]
			);

			expect(outputFiles).toContain(expectedOutputFileName);
		}
	});
});
