import { describe, expect, it } from 'vitest';

import { normalizeInputs } from '../../domain/inputs.ts';

describe('normalizeInputs', () => {
	it('normalizes valid CLI inputs', () => {
		expect(
			normalizeInputs({
				candleInterval: '5',
				candleType: 'minute',
				symbol: ' /es:xcme '
			})
		).toEqual({
			candleInterval: 5,
			candleType: 'minute',
			candles: 20_000,
			minTickSize: 0.25,
			outputDir: 'data',
			seed: 1,
			startIso: '2026-06-08T22:00:00.000Z',
			startPrice: 6000,
			symbol: '/ES:XCME',
			ticksPerCandle: 12
		});
	});

	it('applies defaults for optional inputs', () => {
		expect(
			normalizeInputs({
				candleInterval: 1,
				candleType: 'daily',
				symbol: '/NQ:XCME'
			})
		).toMatchObject({
			outputDir: 'data',
			seed: 1,
			startIso: '2026-06-08T22:00:00.000Z',
			startPrice: 22_000,
			ticksPerCandle: 12
		});
	});

	it('uses explicit price inputs when provided', () => {
		expect(
			normalizeInputs({
				candleInterval: 5,
				candleType: 'minute',
				minTickSize: '0.5',
				startPrice: '6123.5',
				symbol: '/ES:XCME'
			})
		).toMatchObject({
			minTickSize: 0.5,
			startPrice: 6123.5
		});
	});

	it.each([
		[
			{
				candleInterval: 1,
				candleType: 'minute',
				symbol: '/YM:XCBT'
			},
			/symbol/i
		],
		[
			{
				candleInterval: 1,
				candleType: 'weekly',
				symbol: '/ES:XCME'
			},
			/candleType/i
		],
		[
			{
				candleInterval: 0,
				candleType: 'minute',
				symbol: '/ES:XCME'
			},
			/candleInterval/i
		],
		[
			{
				candleInterval: 1,
				candleType: 'minute',
				startPrice: 0,
				symbol: '/ES:XCME'
			},
			/startPrice/i
		]
	])('rejects invalid input %#', (raw, error) => {
		expect(() => normalizeInputs(raw)).toThrow(error);
	});
});
