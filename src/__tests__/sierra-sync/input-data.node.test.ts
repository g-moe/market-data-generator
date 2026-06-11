import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertInputDataExists } from '../../sierra-sync/input-data.ts';

describe('assertInputDataExists', () => {
	it('passes when every required file exists', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-pass-'));

		try {
			const files = {
				daily: join(root, 'tradester_ES_1d.csv'),
				metadata: join(root, 'tradester_ES.json'),
				minutes5: join(root, 'tradester_ES_5m.csv'),
				priceLevel: join(root, 'tradester_ES_1s_pl0.25.csv'),
				scid: join(root, 'tradester_ES.scid'),
				seconds15: join(root, 'tradester_ES_15s.csv'),
				tick100: join(root, 'tradester_ES_100t.csv'),
				volume500: join(root, 'tradester_ES_500v.csv')
			};

			await Promise.all(Object.values(files).map((file) => writeFile(file, 'x')));

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
					daily: join(root, 'missing-1d.csv'),
					metadata: join(root, 'missing.json'),
					minutes5: join(root, 'missing-5m.csv'),
					priceLevel: join(root, 'missing-pl.csv'),
					scid: existing,
					seconds15: join(root, 'missing-15s.csv'),
					tick100: join(root, 'missing-100t.csv'),
					volume500: join(root, 'missing-500v.csv')
				})
			).rejects.toThrow('Run: pnpm run run-md-generate ES');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('fails when a required input path is a directory', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-dir-'));
		const directory = join(root, 'daily-dir');

		try {
			await mkdir(directory);
			await writeFile(join(root, 'tradester_ES.scid'), 'x');

			await expect(
				assertInputDataExists('/ES:XCME', {
					daily: directory,
					metadata: join(root, 'tradester_ES.json'),
					minutes5: join(root, 'tradester_ES_5m.csv'),
					priceLevel: join(root, 'tradester_ES_1s_pl0.25.csv'),
					scid: join(root, 'tradester_ES.scid'),
					seconds15: join(root, 'tradester_ES_15s.csv'),
					tick100: join(root, 'tradester_ES_100t.csv'),
					volume500: join(root, 'tradester_ES_500v.csv')
				})
			).rejects.toThrow('Run: pnpm run run-md-generate ES');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
