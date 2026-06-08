import { describe, expect, it } from 'vitest';

import {
	getCandleDurationMs,
	getCandleStart,
	getCentralParts,
	getTimeWeight,
	isTradingDayStart
} from '../../domain/market-time.ts';
import type { GeneratorInputs } from '../../contracts/types.ts';

describe('market time', () => {
	it('advances minute candles through 23-hour trading sessions', () => {
		const inputs = input({ candleInterval: 30, candleType: 'minute' });

		expect(getCentralParts(getCandleStart(inputs, 0)).time).toBe('17:00:00');
		expect(getCentralParts(getCandleStart(inputs, 45)).time).toBe('15:30:00');
		expect(getCentralParts(getCandleStart(inputs, 46)).time).toBe('17:00:00');
		expect(isTradingDayStart(getCandleStart(inputs, 46))).toBe(true);
	});

	it('advances daily candles by whole day intervals', () => {
		const inputs = input({ candleInterval: 2, candleType: 'daily' });

		expect(
			getCandleStart(inputs, 1).getTime() - getCandleStart(inputs, 0).getTime()
		).toBe(2 * 24 * 60 * 60 * 1000);
		expect(getCandleDurationMs(inputs)).toBe(2 * 24 * 60 * 60 * 1000);
	});

	it('weights regular trading hours more heavily than overnight time', () => {
		expect(
			getTimeWeight(new Date('2026-06-09T08:30:00.000-05:00'), 'volume')
		).toBe(8);
		expect(
			getTimeWeight(new Date('2026-06-09T14:00:00.000-05:00'), 'volatility')
		).toBe(3);
		expect(
			getTimeWeight(new Date('2026-06-09T18:00:00.000-05:00'), 'volume')
		).toBe(1);
	});
});

function input(overrides: Partial<GeneratorInputs>): GeneratorInputs {
	return {
		candleInterval: 1,
		candleType: 'minute',
		candles: 1,
		minTickSize: 0.25,
		outputDir: 'data',
		seed: 1,
		startIso: '2026-06-08T17:00:00.000-05:00',
		startPrice: 100,
		symbol: '/ES:XCME',
		ticksPerCandle: 4,
		...overrides
	};
}
