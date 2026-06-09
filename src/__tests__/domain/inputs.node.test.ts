import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
		expect(() => normalizeInputs({ outputDir: ' ', symbol: 'ES' })).toThrow(
			/outputDir/i
		);
		expect(() => normalizeInputs({ sessionCount: 0, symbol: 'ES' })).toThrow(
			/sessionCount/i
		);
		expect(() => normalizeInputs({ startPrice: 0, symbol: 'ES' })).toThrow(
			/startPrice/i
		);
		expect(() => normalizeInputs({ symbol: 'ES', ticksPerSession: 0 })).toThrow(
			/ticksPerSession/i
		);
		expect(() =>
			normalizeInputs({ anchorIso: 'not-a-date', symbol: 'ES' })
		).toThrow(/anchorIso/i);
	});
});
