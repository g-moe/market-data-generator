import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateMarketData } from '../../domain/generate-market-data.ts';
import { normalizeInputs } from '../../domain/inputs.ts';

describe('generateMarketData', () => {
	it('returns inputs, ticks, candles, and the expected output path', () => {
		const inputs = normalizeInputs({
			symbol: '/ES:XCME',
			candleType: 'minute',
			candleInterval: '5'
		});
		inputs.candles = 3;
		inputs.ticksPerCandle = 4;
		const result = generateMarketData(inputs);

		expect(result.inputs).toBe(inputs);
		expect(result.ticks).toHaveLength(12);
		expect(result.candles).toHaveLength(3);
		expect(result.filePath).toBe(join('data', 'es_5minute.csv'));
	});
});
