import { describe, expect, it } from 'vitest';

import { buildCandles } from '../../domain/candles.ts';
import { normalizeInputs } from '../../domain/inputs.ts';
import { buildTicks } from '../../domain/ticks.ts';

describe('buildCandles', () => {
	it('builds one candle per requested interval', () => {
		const inputs = normalizeInputs({
			candleInterval: '1',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 5;
		inputs.seed = 11;
		inputs.ticksPerCandle = 8;

		expect(buildCandles(buildTicks(inputs), inputs)).toHaveLength(5);
	});

	it('keeps candles internally consistent', () => {
		const inputs = normalizeInputs({
			candleInterval: '30',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 80;
		inputs.seed = 11;
		inputs.ticksPerCandle = 8;
		const candles = buildCandles(buildTicks(inputs), inputs);

		for (const candle of candles) {
			expect(candle.high).toBeGreaterThanOrEqual(candle.open);
			expect(candle.high).toBeGreaterThanOrEqual(candle.close);
			expect(candle.low).toBeLessThanOrEqual(candle.open);
			expect(candle.low).toBeLessThanOrEqual(candle.close);
			expect(candle.volume).toBe(candle.bidVolume + candle.askVolume);
			expect(candle.transactions).toBe(inputs.ticksPerCandle);
		}
	});

	it('continues opens from previous closes except at a new trading day', () => {
		const inputs = normalizeInputs({
			candleInterval: '30',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 80;
		inputs.seed = 11;
		inputs.ticksPerCandle = 8;
		const candles = buildCandles(buildTicks(inputs), inputs);

		for (let index = 1; index < candles.length; index++) {
			const current = candles[index];
			const previous = candles[index - 1];

			expect(
				current.isNewTradingDay
					? current.open !== previous.close
					: current.open === previous.close
			).toBe(true);
		}
	});

	it('throws when ticks are missing for a candle', () => {
		const inputs = normalizeInputs({
			candleInterval: '1',
			candleType: 'minute',
			symbol: '/ES:XCME'
		});
		inputs.candles = 2;

		expect(() => buildCandles([], inputs)).toThrow(
			/missing ticks for candle 0/
		);
	});
});
