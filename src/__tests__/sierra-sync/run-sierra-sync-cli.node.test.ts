import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CliPorts } from '../../shared/cli/run-cli.ts';
import { sierraExportFiles } from '../../sierra-sync/outputs.ts';
import { runSierraSyncCli } from '../../sierra-sync/run-sierra-sync-cli.ts';

describe('runSierraSyncCli', () => {
	it('asks for a run name and uses it as the named output run', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-cli-'));
		const bridgeSourcePath = join(root, 'tradester_sync_bridge.cpp');
		const latestOutputDir = join(root, 'data-out-temp', 'ES', 'latest');
		const events: string[] = [];

		try {
			await writeFile(bridgeSourcePath, '// bridge');
			const result = await runSierraSyncCli(
				ports({
					events,
					latestOutputDir,
					promptAnswers: ['validation-run'],
					selectAnswers: ['ES']
				}),
				{
					bridgeSourcePath,
					buildSierraBridge: false,
					dataInRoot: join(root, 'data-in'),
					dataOutRoot: join(root, 'data-out'),
					dataOutTempRoot: join(root, 'data-out-temp'),
					exportPollIntervalMs: 5,
					exportTimeoutMs: 500,
					sessionCount: 1,
					ticksPerSession: 5
				}
			);

			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('prompt:Run name');
			expect(result.latestOutputDir).toBe(latestOutputDir);
			expect(result.outputDir).toBe(
				join(root, 'data-out', 'ES', 'validation-run')
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function ports({
	events,
	latestOutputDir,
	promptAnswers,
	selectAnswers
}: {
	events: string[];
	latestOutputDir: string;
	promptAnswers: string[];
	selectAnswers: string[];
}): CliPorts {
	return {
		log: (message) => {
			events.push(`log:${message}`);
		},
		prompt: async (message) => {
			events.push(`prompt:${message}`);

			return promptAnswers.shift() ?? '';
		},
		select: async (message) => {
			events.push(`select:${message}`);

			return selectAnswers.shift() ?? '';
		},
		spinner: () => ({
			error: (message) => {
				events.push(`error:${message}`);
			},
			start: (message) => {
				events.push(`start:${message}`);
				setTimeout(() => void writeLatestFiles(latestOutputDir), 25);
			},
			stop: (message) => {
				events.push(`stop:${message}`);
			}
		})
	};
}

async function writeLatestFiles(latestOutputDir: string) {
	await mkdir(latestOutputDir, { recursive: true });
	await Promise.all(
		Object.values(sierraExportFiles('/ES:XCME')).map((fileName) =>
			writeFile(join(latestOutputDir, fileName), fileName)
		)
	);
}
