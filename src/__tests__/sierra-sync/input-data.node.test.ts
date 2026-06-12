import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getTimeframes, TIMEFRAME_KEYS, type OutputFiles } from '../../contracts/index.ts';
import { assertInputDataExists } from '../../sierra-sync/input-data.ts';

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
		const existing = join(root, 'tradester_ES.scid');

		try {
			await writeFile(existing, 'x');

			await expect(
				assertInputDataExists('/ES:XCME', {
					metadata: join(root, 'missing.json'),
					orderbook: join(root, 'missing-orderbook.depth'),
					scid: existing,
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
		const directory = join(root, '1d-dir');

		try {
			await mkdir(directory);
			await writeFile(join(root, 'tradester_ES.scid'), 'x');

			await expect(
				assertInputDataExists('/ES:XCME', {
					metadata: join(root, 'tradester_ES.json'),
					orderbook: join(root, 'tradester_ES_orderbook.depth'),
					scid: join(root, 'tradester_ES.scid'),
					timeframes: {
						...Object.fromEntries(
							TIMEFRAME_KEYS.map((key) => [key, join(root, `tradester_ES_${key}.csv`)])
						),
						'1d': directory
					} as OutputFiles['timeframes']
				})
			).rejects.toThrow('Run: pnpm run run-md-generate ES');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

function createInputFiles(root: string): OutputFiles {
	return {
		metadata: join(root, 'tradester_ES.json'),
		orderbook: join(root, 'depth'),
		scid: join(root, 'tradester_ES.scid'),
		timeframes: Object.fromEntries(
			getTimeframes('/ES:XCME').map((timeframe) => [
				timeframe.key,
				join(root, `tradester_ES_${timeframe.suffix}.csv`)
			])
		) as OutputFiles['timeframes']
	};
}

function getRequiredFiles(files: OutputFiles) {
	return [files.metadata, files.scid, ...Object.values(files.timeframes)];
}
