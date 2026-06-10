import { describe, expect, it } from 'vitest';

import {
	ID_SEQUENCE_MULTIPLIER,
	VOLUME_BAR_SIZE
} from '../../contracts/defaults.ts';
import type { MarketTick } from '../../contracts/types.ts';
import {
	createBarId,
	PriceLevelAggregator,
	TimeAggregator,
	VolumeAggregator
} from '../../md-generation/candles.ts';
import {
	floorTime,
	getDailySessionStart
} from '../../md-generation/market-time.ts';
import { parseIsoToUnixMs } from '../../shared/datetime/index.ts';

describe('streaming candle aggregators', () => {
	it('returns empty series without ticks', () => {
		expect(new PriceLevelAggregator().finish()).toEqual([]);
		expect(new VolumeAggregator(VOLUME_BAR_SIZE).finish()).toEqual([]);
		expect(
			new TimeAggregator((time) => floorTime(time, 15_000)).finish()
		).toEqual([]);
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

	it('splits ticks across exact 500-volume candles', () => {
		const aggregator = new VolumeAggregator(VOLUME_BAR_SIZE);
		const emitted = pushTicks(aggregator, [
			tick({ volume: 300 }),
			tick({ volume: 700 })
		]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(2);
		expect(result.map((candle) => candle.volume)).toEqual([500, 500]);
		expect(result.map((candle) => candle.id)).toEqual([
			createBarId(1_700_000_000_000, 0),
			createBarId(1_700_000_000_000, 1)
		]);
	});

	it('aggregates 15-second, 5-minute, and daily candles from ticks', () => {
		const ticks = [
			tick({ price: 6000, time: parseIsoToUnixMs('2026-06-01T22:00:00.000Z') }),
			tick({ price: 6001, time: parseIsoToUnixMs('2026-06-01T22:00:14.000Z') }),
			tick({ price: 6002, time: parseIsoToUnixMs('2026-06-01T22:00:15.000Z') }),
			tick({ price: 6003, time: parseIsoToUnixMs('2026-06-01T22:05:00.000Z') })
		];
		const seconds15 = aggregateTime(ticks, (time) => floorTime(time, 15_000));
		const minutes5 = aggregateTime(ticks, (time) => floorTime(time, 300_000));
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

describe('createBarId', () => {
	it('combines unix milliseconds and same-ms sequence', () => {
		expect(createBarId(1_700_000_000_000, 2)).toBe(
			1_700_000_000_000n * ID_SEQUENCE_MULTIPLIER + 2n
		);
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
