import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createNodeSierraOps } from '../../sierra-sync/sierra-ops.ts';

describe('createNodeSierraOps', () => {
	it('cleans and recreates temporary directories', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-ops-clean-'));
		const target = join(root, 'temp');

		try {
			await writeFile(join(root, 'temp'), 'old');

			await expect(createNodeSierraOps().cleanTempDir(target)).resolves.toBeUndefined();
			expect((await stat(target)).isDirectory()).toBe(true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('waits until requested export files exist and settle', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-ops-wait-'));
		const exportFile = join(root, 'tradester_ES_15s_GraphData.txt');

		try {
			await writeFile(exportFile, 'ready');

			await expect(
				createNodeSierraOps().waitForFiles(root, ['tradester_ES_15s_GraphData.txt'])
			).resolves.toBeUndefined();
			await expect(readFile(exportFile, 'utf8')).resolves.toBe('ready');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
