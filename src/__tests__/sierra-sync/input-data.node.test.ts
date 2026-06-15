import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TIMEFRAME_KEYS, type OutputFiles } from '../../contracts/index.ts';
import { assertInputDataExists } from '../../sierra-sync/input-data.ts';
import { getOutputFiles } from '../../shared/output-files.ts';

describe('assertInputDataExists', () => {
	it('passes when every required file exists', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-pass-'));

		try {
			const files = createInputFiles(root);

			await Promise.all(getRequiredFiles(files).map((file) => writeFile(file, 'x')));

			await expect(assertInputDataExists('/ES:XCME', files)).resolves.toBeUndefined();
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('fails when a required input path is missing', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-missing-'));
		const existing = join(root, 'tradester_ES_1d.scid');

		try {
			await writeFile(existing, 'x');

			await expect(
				assertInputDataExists('/ES:XCME', {
					metadata: join(root, 'missing.json'),
					orderbook: join(root, 'missing-orderbook.depth'),
					scids: {
						...Object.fromEntries(
							TIMEFRAME_KEYS.map((key) => [key, join(root, `missing-${key}.scid`)])
						),
						'1d': existing
					} as OutputFiles['scids'],
					timeframes: Object.fromEntries(
						TIMEFRAME_KEYS.map((key) => [key, join(root, `missing-${key}.csv`)])
					) as OutputFiles['timeframes']
				})
			).rejects.toThrow('Run: pnpm run run-md-generate ES');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('fails when a required input path is a directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-dir-'));
		const files = createInputFiles(root);

		try {
			await writeFile(files.metadata, 'x');
			await Promise.all(Object.values(files.scids).map((file) => writeFile(file, 'x')));
			await Promise.all(
				Object.entries(files.timeframes)
					.filter(([key]) => key !== '1d')
					.map(([, file]) => writeFile(file, 'x'))
			);
			await mkdir(files.timeframes['1d']);

			await expect(assertInputDataExists('/ES:XCME', files)).rejects.toThrow(
				'Run: pnpm run run-md-generate ES'
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function createInputFiles(root: string): OutputFiles {
	return getOutputFiles('/ES:XCME', root);
}

function getRequiredFiles(files: OutputFiles) {
	return [files.metadata, ...Object.values(files.scids), ...Object.values(files.timeframes)];
}
