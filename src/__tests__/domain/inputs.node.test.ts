import { describe, expect, it } from 'vitest';

import { normalizeInputs } from '../../domain/inputs.ts';

describe('normalizeInputs', () => {
	it('normalizes valid CLI inputs', () => {
		expect(
			normalizeInputs({
				symbol: ' /es:xcme ',
				candleType: 'minute',
				candleInterval: '5'
			})
		).toEqual({
			symbol: '/ES:XCME',
			minTickSize: 0.25,
			candles: 20_000,
			candleType: 'minute',
			candleInterval: 5,
			startIso: '2026-06-08T17:00:00.000-05:00',
			startPrice: 100,
			seed: 1,
			ticksPerCandle: 12,
			outputDir: 'data'
		});
	});

	it('applies defaults for optional inputs', () => {
		expect(
			normalizeInputs({
				symbol: '/NQ:XCME',
				candleType: 'daily',
				candleInterval: 1
			})
		).toMatchObject({
			startIso: '2026-06-08T17:00:00.000-05:00',
			startPrice: 100,
			seed: 1,
			ticksPerCandle: 12,
			outputDir: 'data'
		});
	});

	it.each([
		[
			{
				symbol: '/YM:XCBT',
				candleType: 'minute',
				candleInterval: 1
			},
			/symbol/i
		],
		[
			{
				symbol: '/ES:XCME',
				candleType: 'weekly',
				candleInterval: 1
			},
			/candleType/i
		],
		[
			{
				symbol: '/ES:XCME',
				candleType: 'minute',
				candleInterval: 0
			},
			/candleInterval/i
		]
	])('rejects invalid input %#', (raw, error) => {
		expect(() => normalizeInputs(raw)).toThrow(error);
	});
});
