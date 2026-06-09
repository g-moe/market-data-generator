import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { runSierraSync } from '../../../sierra-sync/sierra-sync.ts';

const execFileAsync = promisify(execFile);
const SIERRA_PROCESS_NAME = 'SierraChart*';

describe('Sierra sync e2e', () => {
	it('runs the real Sierra checkpoint flow and copies fresh latest exports to the named run', async () => {
		const syncRunId = `e2e-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;

		// Checkpoint 1: Sierra must already be open because this test exercises the real app boundary.
		await expectSierraIsRunning();

		// Checkpoint 1: generate real input files, install/build the real bridge, and trigger Sierra reload.
		const result = await runSierraSync({
			sessionCount: 1,
			symbol: 'ES',
			syncRunId,
			ticksPerSession: 5
		});

		expect(result.bridgeDllPaths.length).toBeGreaterThan(0);
		await expect(
			stat(join('data-in', 'ES', 'tradester_ES.scid'))
		).resolves.toMatchObject({
			size: expect.any(Number)
		});

		// Checkpoint 2: Sierra writes fixed latest exports; Node copies them into the named run.
		expect(result.latestOutputDir).toBe(
			resolve('data-out-temp', 'ES', 'latest')
		);
		expect(result.outputDir).toBe(join('data-out', 'ES', syncRunId));
		await Promise.all(
			Object.values(result.copiedFiles).map(async (filePath) => {
				await expect(stat(filePath)).resolves.toMatchObject({
					size: expect.any(Number)
				});
			})
		);
	});
});

async function expectSierraIsRunning() {
	const { stdout } = await execFileAsync('powershell.exe', [
		'-NoProfile',
		'-Command',
		`(Get-Process -Name ${SIERRA_PROCESS_NAME} -ErrorAction SilentlyContinue).Count`
	]);
	const processCount = Number.parseInt(stdout.trim(), 10);
	expect(
		processCount,
		`Expected a ${SIERRA_PROCESS_NAME} process to be running before starting the Sierra e2e test.`
	).toBeGreaterThan(0);
}
