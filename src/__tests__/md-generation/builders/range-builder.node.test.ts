import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import type { MarketTick } from '../../../contracts/types.ts';
import { RangeAggregator } from '../../../md-generation/builders/range-builder.ts';

const TEST_TICK_SIZE = 0.25;
const TEST_TICK_DECIMALS = 2;
const STANDARD_RANGE_TICKS = TIMEFRAME_DEFINITIONS['10r'].size;

describe('RangeAggregator', () => {
	it('returns an empty series without ticks', () => {
		expect(
			new RangeAggregator(STANDARD_RANGE_TICKS, TEST_TICK_SIZE, TEST_TICK_DECIMALS).finish()
		).toEqual([]);
	});

	it('builds standard range candles with adjusted completed closes', () => {
		const aggregator = new RangeAggregator(2, TEST_TICK_SIZE, TEST_TICK_DECIMALS);
		const emitted = pushTicks(aggregator, [
			tick({ price: 6000, volume: 2 }),
			tick({ price: 6000.25, volume: 3 }),
			tick({ price: 6000.5, volume: 5 }),
			tick({ price: 6000.75, volume: 7 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			close: 6000.5,
			high: 6000.5,
			low: 6000,
			open: 6000,
			volume: 10
		});
		expect(result[1]).toMatchObject({
			close: 6000.75,
			high: 6000.75,
			low: 6000.75,
			open: 6000.75,
			volume: 7
		});
	});

	it('completes partial standard range candles at session boundaries', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [
			tick({ price: 4676, volume: 15 }),
			tick({ price: 4677.25, volume: 5 }),
			tick({ price: 4678.25, volume: 12 }),
			tick({ price: 4678, volume: 4 })
		]);
		const result = [...emitted, ...aggregator.finish(4675.5)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4678.25,
			high: 4678.25,
			low: 4675.75,
			open: 4676,
			volume: 36
		});
	});

	it('rounds synthetic decimal range boundaries to symbol tick decimals', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const emitted = pushTicks(aggregator, [
			tick({ price: 2.88175, volume: 1 }),
			tick({ price: 2.8812, volume: 1 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result[0].low).toBe(2.88125);
	});

	it('keeps float32 tick-boundary prices in range by tick index', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const emitted = pushTicks(aggregator, [
			tick({ price: Math.fround(2.88675), volume: 1 }),
			tick({ price: Math.fround(2.887), volume: 1 }),
			tick({ price: Math.fround(2.8865), volume: 1 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			high: 2.887,
			low: 2.8865,
			open: 2.88675,
			volume: 3
		});
	});

	it('resolves pending opens from the first prior-range breakout direction', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const completed = [
			...pushTicks(aggregator, [
				tick({ price: 2.88025, volume: 1 }),
				tick({ price: 2.8805, volume: 1 })
			]),
			...aggregator.finish(2.88025)
		];
		const next = [
			...pushTicks(aggregator, [
				tick({ price: 2.88025, volume: 1 }),
				tick({ price: 2.8804, volume: 1 }),
				tick({ price: 2.8802, volume: 1 }),
				tick({ price: 2.8806, volume: 1 })
			]),
			...aggregator.finish()
		];

		expect(completed[0]).toMatchObject({
			high: 2.8805,
			low: 2.88025
		});
		expect(next[0]).toMatchObject({
			open: 2.8802
		});
	});

	it('keeps the actual pending open for one-tick-short ranges that reverse side', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const completed = [
			...pushTicks(aggregator, [
				tick({ price: 2.89605, volume: 1 }),
				tick({ price: 2.8956, volume: 1 })
			]),
			...aggregator.finish()
		];
		const next = [
			...pushTicks(aggregator, [
				tick({ price: 2.89575, volume: 1 }),
				tick({ price: 2.89605, volume: 1 }),
				tick({ price: 2.89635, volume: 1 })
			]),
			...aggregator.finish()
		];

		expect(completed[0]).toMatchObject({
			close: 2.8956,
			high: 2.89605,
			low: 2.8956
		});
		expect(next[0]).toMatchObject({
			open: 2.89575
		});
	});

	it('uses a synthetic pending open when breakout follows the prior close side', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const completed = [
			...pushTicks(aggregator, [
				tick({ price: 2.8784, volume: 1 }),
				tick({ price: 2.87865, volume: 1 })
			]),
			...aggregator.finish()
		];
		const next = [
			...pushTicks(aggregator, [
				tick({ price: 2.8785, volume: 1 }),
				tick({ price: 2.87875, volume: 1 })
			]),
			...aggregator.finish()
		];

		expect(completed[0]).toMatchObject({
			close: 2.87865,
			high: 2.87865,
			low: 2.8784
		});
		expect(next[0]).toMatchObject({
			open: 2.8787
		});
	});

	it('uses the breakout side for pending opens after short partial ranges', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const completed = [
			...pushTicks(aggregator, [
				tick({ price: 2.8659, volume: 1 }),
				tick({ price: 2.86565, volume: 1 })
			]),
			...aggregator.finish()
		];
		const next = [
			...pushTicks(aggregator, [
				tick({ price: 2.86575, volume: 1 }),
				tick({ price: 2.866, volume: 1 })
			]),
			...aggregator.finish()
		];

		expect(completed[0]).toMatchObject({
			close: 2.86565,
			high: 2.8659,
			low: 2.86565
		});
		expect(next[0]).toMatchObject({
			open: 2.86595
		});
	});

	it('uses the breakout side for pending opens after full prior ranges', () => {
		const aggregator = new RangeAggregator(STANDARD_RANGE_TICKS, 0.00005, 5);
		const completed = [
			...pushTicks(aggregator, [
				tick({ price: 2.886, volume: 1 }),
				tick({ price: 2.8855, volume: 1 })
			]),
			...aggregator.finish()
		];
		const next = [
			...pushTicks(aggregator, [
				tick({ price: 2.8857, volume: 1 }),
				tick({ price: 2.88615, volume: 1 })
			]),
			...aggregator.finish()
		];

		expect(completed[0]).toMatchObject({
			close: 2.8855,
			high: 2.886,
			low: 2.8855
		});
		expect(next[0]).toMatchObject({
			open: 2.88605
		});
	});

	it('preserves final partial standard range candles without a next open', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [
			tick({ price: 8183, volume: 18 }),
			tick({ price: 8181.75, volume: 20 }),
			tick({ price: 8182.25, volume: 36 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 8182.25,
			high: 8183,
			low: 8181.75,
			open: 8183,
			volume: 74
		});
	});

	it('keeps the next session open outside partial standard range candles', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [
			tick({ price: 4545.75, volume: 18 }),
			tick({ price: 4547.5, volume: 21 }),
			tick({ price: 4545.5, volume: 7 }),
			tick({ price: 4546, volume: 11 })
		]);
		const result = [...emitted, ...aggregator.finish(4545.25)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4545.5,
			high: 4547.5,
			low: 4545.5,
			open: 4545.75,
			volume: 57
		});
	});

	it('does not expand partial standard range highs toward the next session open', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [
			tick({ price: 4481, volume: 17 }),
			tick({ price: 4480.5, volume: 11 }),
			tick({ price: 4479.5, volume: 21 })
		]);
		const result = [...emitted, ...aggregator.finish(4481.75)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4479.5,
			high: 4481,
			low: 4479.5,
			open: 4481,
			volume: 49
		});
	});

	it('expands partial standard range highs when the next session opens outside the full range', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [
			tick({ price: 4578.5, volume: 9 }),
			tick({ price: 4578.25, volume: 17 }),
			tick({ price: 4579.25, volume: 9 })
		]);
		const result = [...emitted, ...aggregator.finish(4582.75)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4578.25,
			high: 4580.75,
			low: 4578.25,
			open: 4578.5
		});
	});

	it('expands zero-range boundary candles toward the next session open', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [tick({ price: 4338.5, volume: 15 })]);
		const result = [...emitted, ...aggregator.finish(4343.25)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4338.5,
			high: 4341,
			low: 4338.5,
			open: 4338.5,
			volume: 15
		});
	});

	it('does not expand zero-range boundary candles when the next session opens inside the full range', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const emitted = pushTicks(aggregator, [tick({ price: 4328, volume: 39 })]);
		const result = [...emitted, ...aggregator.finish(4329.25)];

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			close: 4328,
			high: 4328,
			low: 4328,
			open: 4328,
			volume: 39
		});
	});

	it('moves reversing pending opens outside the prior range unless it is one tick short of full', () => {
		const aggregator = new RangeAggregator(
			STANDARD_RANGE_TICKS,
			TEST_TICK_SIZE,
			TEST_TICK_DECIMALS
		);
		const first = pushTicks(aggregator, [
			tick({ price: 4545.75 }),
			tick({ price: 4547.5 }),
			tick({ price: 4545.5 })
		]);
		const completed = [...first, ...aggregator.finish(4546.25)];
		const second = pushTicks(aggregator, [tick({ price: 4546.25 }), tick({ price: 4547.75 })]);
		const result = [...completed, ...second, ...aggregator.finish()];

		expect(result[1]).toMatchObject({
			high: 4547.75,
			low: 4546.25,
			open: 4547.75
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
