import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import type { MarketTick } from '../../../contracts/types.ts';
import { TickAggregator } from '../../../md-generation/builders/tick-builder.ts';

describe('TickAggregator', () => {
	it('returns an empty series without ticks', () => {
		expect(new TickAggregator(TIMEFRAME_DEFINITIONS['100t'].size).finish()).toEqual([]);
	});

	it('builds tick candles from whole ticks', () => {
		const aggregator = new TickAggregator(3);
		const emitted = pushTicks(aggregator, [
			tick({ price: 6000, volume: 2 }),
			tick({ price: 6001, volume: 3 }),
			tick({ price: 5999, volume: 5 }),
			tick({ price: 6002, volume: 7 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			close: 5999,
			high: 6001,
			low: 5999,
			open: 6000,
			volume: 10
		});
		expect(result[1]).toMatchObject({
			close: 6002,
			high: 6002,
			low: 6002,
			open: 6002,
			volume: 7
		});
	});
});

function tick(overrides: Partial<MarketTick> = {}): MarketTick {
	return {
		price: 6000,
		sessionIndex: 0,
		side: 'ask',
		time: 1_700_000_000_000,
		volume: 1,
		...overrides
	};
}

function pushTicks<T>(
	aggregator: { pushTick: (tick: MarketTick, emitted: T[]) => void },
	ticks: MarketTick[]
) {
	const emitted: T[] = [];

	for (const current of ticks) {
		aggregator.pushTick(current, emitted);
	}

	return emitted;
}
