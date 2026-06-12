import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import type { MarketTick, MdCandle } from '../../../contracts/types.ts';
import { TimeAggregator } from '../../../md-generation/builders/time-builder.ts';
import { floorTime, getDailySessionStart } from '../../../md-generation/shared/market-time.ts';
import { parseIsoToUnixMs } from '../../../shared/datetime/index.ts';

describe('TimeAggregator', () => {
	it('returns an empty series without ticks', () => {
		expect(
			new TimeAggregator((time) =>
				floorTime(time, TIMEFRAME_DEFINITIONS['15s'].milliseconds)
			).finish()
		).toEqual([]);
	});

	it('supports fixed-size time buckets', () => {
		const emitted: MdCandle[] = [];
		const aggregator = new TimeAggregator(TIMEFRAME_DEFINITIONS['15s'].milliseconds);

		aggregator.pushTickValuesForBucket(
			1_700_000_000_000,
			6000,
			2,
			1_700_000_000_000,
			emitted,
			'ask'
		);
		aggregator.pushTickValuesForBucket(
			1_700_000_001_000,
			6005,
			3,
			1_700_000_000_000,
			emitted,
			'bid'
		);

		expect(aggregator.finish()).toMatchObject([
			expect.objectContaining({
				close: 6005,
				high: 6005,
				low: 6000,
				open: 6000
			})
		]);
		expect(emitted).toHaveLength(0);
	});

	it('throws when the bucket function is missing', () => {
		const emitted: MdCandle[] = [];

		expect(() => {
			const aggregator = new TimeAggregator(undefined as unknown as (time: number) => number);

			aggregator.pushTickValues(1_700_000_000_000, 6000, 1, emitted, 'ask');
		}).toThrow('Time bucket function is not configured');
	});

	it('aggregates 15-second, 5-minute, and daily candles from ticks', () => {
		const ticks = [
			tick({ price: 6000, time: parseIsoToUnixMs('2026-06-01T22:00:00.000Z') }),
			tick({ price: 6001, time: parseIsoToUnixMs('2026-06-01T22:00:14.000Z') }),
			tick({ price: 6002, time: parseIsoToUnixMs('2026-06-01T22:00:15.000Z') }),
			tick({ price: 6003, time: parseIsoToUnixMs('2026-06-01T22:05:00.000Z') })
		];
		const seconds15 = aggregateTime(ticks, (time) =>
			floorTime(time, TIMEFRAME_DEFINITIONS['15s'].milliseconds)
		);
		const minutes5 = aggregateTime(ticks, (time) =>
			floorTime(time, TIMEFRAME_DEFINITIONS['5m'].milliseconds)
		);
		const daily = aggregateTime(ticks, getDailySessionStart);

		expect(seconds15).toHaveLength(3);
		expect(minutes5).toHaveLength(2);
		expect(daily).toHaveLength(1);
		expect(daily[0]).toMatchObject({
			close: 6003,
			high: 6003,
			low: 6000,
			open: 6000
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

function aggregateTime(
	ticks: MarketTick[],
	getBucket: ConstructorParameters<typeof TimeAggregator>[0]
) {
	const aggregator = new TimeAggregator(getBucket);
	const emitted = pushTicks(aggregator, ticks);

	return [...emitted, ...aggregator.finish()];
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
