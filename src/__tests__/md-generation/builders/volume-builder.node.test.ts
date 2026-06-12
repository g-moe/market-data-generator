import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../../contracts/timeframes.ts';
import type { MarketTick } from '../../../contracts/types.ts';
import { VolumeAggregator } from '../../../md-generation/builders/volume-builder.ts';
import { createBarId } from '../../../md-generation/shared/candles.ts';

describe('VolumeAggregator', () => {
	it('returns an empty series without ticks', () => {
		expect(new VolumeAggregator(TIMEFRAME_DEFINITIONS['500v'].size).finish()).toEqual([]);
	});

	it('splits ticks across exact volume candles', () => {
		const aggregator = new VolumeAggregator(TIMEFRAME_DEFINITIONS['500v'].size);
		const emitted = pushTicks(aggregator, [tick({ volume: 300 }), tick({ volume: 700 })]);
		const result = [...emitted, ...aggregator.finish()];

		expect(result).toHaveLength(2);
		expect(result.map((candle) => candle.volume)).toEqual([500, 500]);
		expect(result.map((candle) => candle.askVolume)).toEqual([500, 500]);
		expect(result.map((candle) => candle.bidVolume)).toEqual([0, 0]);
		expect(result.map((candle) => candle.id)).toEqual([
			createBarId(1_700_000_000_000, 0),
			createBarId(1_700_000_000_000, 1)
		]);
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
