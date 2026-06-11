import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule } from '../../../shared/cli/is-main-module.ts';

describe('isMainModule', () => {
	it('matches the current entrypoint path using file URL semantics', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run-md-generate.ts');

		expect(isMainModule(pathToFileURL(entrypointPath).href, entrypointPath)).toBe(true);
	});

	it('does not match a different entrypoint path', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run-md-generate.ts');
		const otherPath = join(process.cwd(), 'src', 'run-sierra-generate.ts');

		expect(isMainModule(pathToFileURL(entrypointPath).href, otherPath)).toBe(false);
	});

	it('does not match without an entrypoint path', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run-md-generate.ts');

		expect(isMainModule(pathToFileURL(entrypointPath).href, undefined)).toBe(false);
	});

	it('returns false when process argv is missing a second entry', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run-md-generate.ts');
		const originalArgv = process.argv.slice();
		const argvLength = process.argv.length;

		process.argv.length = 1;

		try {
			expect(isMainModule(pathToFileURL(entrypointPath).href)).toBe(false);
		} finally {
			process.argv = originalArgv;
			process.argv.length = argvLength;
		}
	});

	it('uses process.argv when argvPath is omitted', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run-md-generate.ts');
		const originalArgv = process.argv.slice();

		process.argv = ['node', entrypointPath];
		try {
			expect(isMainModule(pathToFileURL(entrypointPath).href)).toBe(true);
		} finally {
			process.argv = originalArgv;
		}
	});
});
