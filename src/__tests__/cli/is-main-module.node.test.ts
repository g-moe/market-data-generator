import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule } from '../../cli/is-main-module.ts';

describe('isMainModule', () => {
	it('matches the current entrypoint path using file URL semantics', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run.ts');

		expect(
			isMainModule(pathToFileURL(entrypointPath).href, entrypointPath)
		).toBe(true);
	});

	it('does not match a different entrypoint path', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run.ts');
		const otherPath = join(process.cwd(), 'src', 'run-without-cli.ts');

		expect(isMainModule(pathToFileURL(entrypointPath).href, otherPath)).toBe(
			false
		);
	});

	it('does not match without an entrypoint path', () => {
		const entrypointPath = join(process.cwd(), 'src', 'run.ts');

		expect(isMainModule(pathToFileURL(entrypointPath).href, undefined)).toBe(
			false
		);
	});
});
