import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateMarketData } from '../../domain/generate-market-data.ts';
import { normalizeInputs } from '../../domain/inputs.ts';
import { hashOutput, serializeCandlesToCsv } from '../../io/csv.ts';

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
		expect(result.filePath).toBe(join('data', 'ESM26-CME.csv'));
	});

	it('keeps generated CSV output deterministic', () => {
		const inputs = normalizeInputs({
			candleInterval: '5',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 12;
		inputs.seed = 7;
		inputs.startPrice = 5_300;
		inputs.ticksPerCandle = 4;

		const result = generateMarketData(inputs);
		const csv = serializeCandlesToCsv(result.candles);

		expect(hashOutput(csv)).toBe(
			'cfb0ff936b356743c4151df4f4d65c2bd407ee6f2ec46b91d559b9e328d4d2bc'
		);
	});
});
