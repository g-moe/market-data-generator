import { describe, expect, it } from 'vitest';

import type { MarketTick } from '../../../contracts/types.ts';
import { PriceLevelAggregator } from '../../../md-generation/builders/price-level-builder.ts';

describe('PriceLevelAggregator', () => {
	it('returns an empty series without ticks', () => {
		expect(new PriceLevelAggregator().finish()).toEqual([]);
	});

	it('builds price-level candles with volume by price', () => {
		const aggregator = new PriceLevelAggregator();
		const emitted = pushTicks(aggregator, [
			tick({ price: 6000, volume: 2 }),
			tick({ price: 6000.25, time: 1_700_000_000_500, volume: 3 }),
			tick({ price: 6000, time: 1_700_000_001_000, volume: 5 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(2);
		expect([...result[0].prices.entries()]).toEqual([
			[6000, 2],
			[6000.25, 3]
		]);
		expect(result[0]).toMatchObject({
			close: 6000.25,
			high: 6000.25,
			low: 6000,
			open: 6000,
			volume: 5,
			vwap: 6000.15
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
