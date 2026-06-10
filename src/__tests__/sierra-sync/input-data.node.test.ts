import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertInputDataExists } from '../../sierra-sync/input-data.ts';

describe('assertInputDataExists', () => {
	it('hard fails with the generation command when a required input file is missing', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-input-'));
		const existing = join(root, 'tradester_ES.scid');

		try {
			await writeFile(existing, 'x');
			await expect(
				assertInputDataExists('/ES:XCME', {
					daily: join(root, 'missing-1d.csv'),
					minutes5: join(root, 'missing-5m.csv'),
					priceLevel: join(root, 'missing-pl.csv'),
					scid: existing,
					seconds15: join(root, 'missing-15s.csv'),
					volume500: join(root, 'missing-500v.csv')
				})
			).rejects.toThrow('Run: pnpm run generate:without ES');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
