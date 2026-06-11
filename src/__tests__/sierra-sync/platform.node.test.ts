import { describe, expect, it } from 'vitest';

import { runSierraSyncCli } from '../../sierra-sync/run-sierra-sync-cli.ts';
import { runSierraSync } from '../../sierra-sync/sierra-sync.ts';

describe('sierra-sync platform guard', () => {
	it('rejects direct sync before symbol validation when the OS is not Windows', async () => {
		await withProcessPlatform('linux', async () => {
			await expect(runSierraSync('not-a-symbol', { log: () => undefined })).rejects.toThrow(
				'sierra-sync can only run on Windows'
			);
		});
	});

	it('rejects cli execution before argument validation when the OS is not Windows', async () => {
		await withProcessPlatform('linux', async () => {
			await expect(runSierraSyncCli([])).rejects.toThrow('sierra-sync can only run on Windows');
		});
	});
});

async function withProcessPlatform(platform: string, callback: () => Promise<void>) {
	const original = Object.getOwnPropertyDescriptor(process, 'platform');
	if (original === undefined) throw new Error('process.platform descriptor was not found');

	Object.defineProperty(process, 'platform', { value: platform });

	try {
		await callback();
	} finally {
		Object.defineProperty(process, 'platform', original);
	}
}
