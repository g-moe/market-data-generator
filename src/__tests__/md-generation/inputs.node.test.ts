import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_OUTPUT_ROOT } from '../../contracts/defaults.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';

describe('normalizeInputs', () => {
	it('normalizes valid symbol-only inputs', () => {
		const inputs = normalizeInputs({
			outputDir: 'tmp/data',
			sessionCount: 3,
			startPrice: 6100.25,
			symbol: ' es ',
			ticksPerSession: 5
		});

		expect(inputs).toMatchObject({
			outputDir: join('tmp', 'data', 'ES'),
			outputRoot: 'tmp/data',
			sessionCount: 3,
			startPrice: 6100.25,
			symbol: '/ES:XCME',
			ticksPerSession: 5
		});
	});

	it('uses data-in as the default output root', () => {
		expect(normalizeInputs({ symbol: 'ES' })).toMatchObject({
			outputDir: join(DEFAULT_OUTPUT_ROOT, 'ES'),
			outputRoot: DEFAULT_OUTPUT_ROOT
		});
	});

	it('accepts the previous full Sierra-style symbol id', () => {
		expect(
			normalizeInputs({
				symbol: '/ES:XCME'
			})
		).toMatchObject({
			symbol: '/ES:XCME',
			ticksPerSession: 10_000
		});
	});

	it('rejects invalid inputs', () => {
		expect(() => normalizeInputs({ symbol: 'YM' })).toThrow(/symbol/i);
		expect(() => normalizeInputs({ outputDir: ' ', symbol: 'ES' })).toThrow(/outputDir/i);
		expect(() => normalizeInputs({ sessionCount: 0, symbol: 'ES' })).toThrow(/sessionCount/i);
		expect(() => normalizeInputs({ startPrice: 0, symbol: 'ES' })).toThrow(/startPrice/i);
		expect(() => normalizeInputs({ symbol: 'ES', ticksPerSession: 0 })).toThrow(/ticksPerSession/i);
		expect(() => normalizeInputs({ anchorIso: 'not-a-date', symbol: 'ES' })).toThrow(/anchorIso/i);
	});

	it('re-throws non-RangeError date parser failures as-is', async () => {
		vi.resetModules();
		vi.doMock('../../shared/datetime/index.ts', async () => ({
			...(await vi.importActual('../../shared/datetime/index.ts')),
			parseIsoToUnixMs: () => {
				throw new TypeError('timezone parse failure');
			}
		}));

		const { normalizeInputs: importedNormalizeInputs } =
			await import('../../md-generation/inputs.ts');

		expect(() => importedNormalizeInputs({ anchorIso: 'bad-anchor', symbol: 'ES' })).toThrow(
			'timezone parse failure'
		);
		vi.resetModules();
	});
});
