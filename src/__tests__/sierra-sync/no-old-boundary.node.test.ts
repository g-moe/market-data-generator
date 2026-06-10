import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const NEW_SIERRA_FILES = [
	'bridge-source.ts',
	'constants.ts',
	'input-data.ts',
	'paths.ts',
	'run-sierra-sync-cli.ts',
	'sierra-export.ts',
	'sierra-ops.ts',
	'sierra-sync.ts'
];

describe('new Sierra sync boundary', () => {
	it('does not import from sierra-sync-old', async () => {
		await Promise.all(
			NEW_SIERRA_FILES.map(async (fileName) => {
				const text = await readFile(
					join('src', 'sierra-sync', fileName),
					'utf8'
				);
				expect(text).not.toContain('sierra-sync-old');
			})
		);
	});
	it('builds the Sierra study for the visible ARM64 app into the Data directory', async () => {
		const text = await readFile(
			join('src', 'sierra-sync', 'sierra-ops.ts'),
			'utf8'
		);
		expect(text).toContain('vcvarsamd64_arm64.bat');
		expect(text).toContain('SIERRA_BRIDGE_DLL_FILE_NAME');
	});
});
