import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { runSierraSync } from '../../../sierra-sync/sierra-sync.ts';

const execFileAsync = promisify(execFile);
const SIERRA_PROCESS_NAME = 'SierraChart*';
const POLL_INTERVAL_MS = 1_000;
const EXPORT_TIMEOUT_MS = 60_000;

describe('Sierra sync e2e', () => {
	it('runs the real Sierra checkpoint flow and waits for fresh exports', async () => {
		const startedAt = Date.now();
		const syncRunId = `e2e-${new Date(startedAt).toISOString().replaceAll(/[:.]/g, '-')}`;

		// Checkpoint 1: Sierra must already be open because this test exercises the real app boundary.
		await expectSierraIsRunning();

		// Checkpoint 1: generate real input files, install/build the real bridge, and write the real request.
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

		// Checkpoint 2: Sierra studies must respond by exporting every expected chart file for this run.
		const exportedFiles = Object.values(result.request.exportFiles).map(
			(fileName) => join(result.dataOutTempDir, fileName)
		);
		await waitForFreshFiles(exportedFiles, startedAt);
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

async function waitForFreshFiles(filePaths: string[], startedAt: number) {
	const deadline = Date.now() + EXPORT_TIMEOUT_MS;
	while (Date.now() <= deadline) {
		const staleOrMissing = await getStaleOrMissingFiles(filePaths, startedAt);
		if (staleOrMissing.length === 0) return;
		await sleep(POLL_INTERVAL_MS);
	}

	const staleOrMissing = await getStaleOrMissingFiles(filePaths, startedAt);
	throw new Error(
		`Timed out waiting for fresh Sierra exports:\n${staleOrMissing.join('\n')}`
	);
}

async function getStaleOrMissingFiles(filePaths: string[], startedAt: number) {
	const staleOrMissing: string[] = [];
	for (const filePath of filePaths) {
		try {
			const file = await stat(filePath);
			if (file.size <= 0 || file.mtimeMs < startedAt)
				staleOrMissing.push(filePath);
		} catch {
			staleOrMissing.push(filePath);
		}
	}
	return staleOrMissing;
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
