import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CliPorts } from '../../shared/cli/run-cli.ts';
import { SIERRA_SYNC_REQUEST_FILE } from '../../sierra-sync/constants.ts';
import { runSierraSyncCli } from '../../sierra-sync/run-sierra-sync-cli.ts';

describe('runSierraSyncCli', () => {
	it('asks for a run name and uses it as the sync run id', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-cli-'));
		const bridgeSourcePath = join(root, 'tradester_sync_bridge.cpp');
		const sierraDataDir = join(root, 'Sierra Chart', 'Data');
		const acsSourceDir = join(root, 'Sierra Chart', 'ACS_Source');
		const events: string[] = [];

		try {
			await writeFile(bridgeSourcePath, '// bridge');
			const result = await runSierraSyncCli(
				ports({
					events,
					promptAnswers: ['validation-run'],
					selectAnswers: ['ES']
				}),
				{
					acsSourceDir,
					bridgeSourcePath,
					buildSierraBridge: false,
					dataInRoot: join(root, 'data-in'),
					dataOutRoot: join(root, 'data-out'),
					dataOutTempRoot: join(root, 'data-out-temp'),
					sessionCount: 1,
					sierraDataDir,
					ticksPerSession: 5
				}
			);

			expect(events).toContain('select:Choose symbol');
			expect(events).toContain('prompt:Run name');
			expect(result.request.runId).toBe('validation-run');
			expect(result.dataOutTempDir).toBe(
				join(root, 'data-out-temp', 'ES', 'validation-run')
			);
			expect(
				JSON.parse(
					await readFile(join(sierraDataDir, SIERRA_SYNC_REQUEST_FILE), 'utf8')
				)
			).toMatchObject({
				dataOutTempDir: join(root, 'data-out-temp', 'ES', 'validation-run'),
				runId: 'validation-run'
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function ports({
	events,
	promptAnswers,
	selectAnswers
}: {
	events: string[];
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
			},
			stop: (message) => {
				events.push(`stop:${message}`);
			}
		})
	};
}
