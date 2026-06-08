import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateMarketData } from '../../domain/generate-market-data.ts';
import { normalizeInputs } from '../../domain/inputs.ts';

describe('generateMarketData', () => {
	it('returns inputs, ticks, candles, and the expected output path', () => {
		const inputs = normalizeInputs({
			candleInterval: '5',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 3;
		inputs.ticksPerCandle = 4;
		const result = generateMarketData(inputs);

		expect(result.inputs).toBe(inputs);
		expect(result.ticks).toHaveLength(12);
		expect(result.candles).toHaveLength(3);
		expect(result.filePath).toBe(join('data', 'tradester_ES.scid'));
	});

	it('returns a prefixed scid path for the selected symbol id', () => {
		const inputs = normalizeInputs({
			candleInterval: '5',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 1;
		inputs.ticksPerCandle = 1;
		const result = generateMarketData(inputs);

		expect(result.filePath).toBe(join('data', 'tradester_ES.scid'));
	});

	it('keeps generated market data deterministic', () => {
		const inputs = normalizeInputs({
			candleInterval: '5',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 12;
		inputs.seed = 7;
		inputs.startPrice = 5_300;
		inputs.ticksPerCandle = 4;

		const firstResult = generateMarketData(inputs);
		const secondResult = generateMarketData({ ...inputs });

		expect(secondResult.candles).toEqual(firstResult.candles);
		expect(secondResult.ticks).toEqual(firstResult.ticks);
	});
});
