import { ID_SEQUENCE_MULTIPLIER } from '../contracts/defaults.ts';
import type {
	MarketTick,
	TradeSide,
	MdCandle,
	MdCandleVolumeByPrice
} from '../contracts/types.ts';
import { floorTime } from './market-time.ts';

type MutableCandle = {
	close: number;
	high: number;
	low: number;
	open: number;
	priceVolume: number;
	time: number;
	volume: number;
	bidVolume: number;
	askVolume: number;
};

export class PriceLevelAggregator {
	private current:
		| { candle: MutableCandle; prices: Map<number, number> }
		| undefined;
	private pos = 0;

	pushTick(tick: MarketTick, emitted: MdCandleVolumeByPrice[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted, tick.side);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandleVolumeByPrice[],
		side: TradeSide | undefined = undefined
	) {
		const bucket = floorTime(time, 1000);
		if (this.current === undefined || this.current.candle.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = {
				candle: createMutableCandleForValues(price, bucket, volume, side),
				prices: new Map()
			};
		} else {
			addTickValues(this.current.candle, price, volume, side);
		}

		this.current.prices.set(
			price,
			(this.current.prices.get(price) ?? 0) + volume
		);
	}

	finish() {
		const emitted: MdCandleVolumeByPrice[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandleVolumeByPrice[]) {
		if (this.current === undefined) {
			return;
		}

		emitted.push(
			finalizeMutablePriceLevelCandle(
				this.current.candle,
				this.pos,
				this.current.prices
			)
		);
		this.pos++;
		this.current = undefined;
	}
}

export class TimeAggregator {
	private current: MutableCandle | undefined;
	private pos = 0;
	private readonly bucketMs: number | undefined;
	private readonly getBucket: ((time: number) => number) | undefined;

	constructor(bucket: ((time: number) => number) | number) {
		if (typeof bucket === 'number') {
			this.bucketMs = bucket;
			this.getBucket = undefined;
		} else {
			this.bucketMs = undefined;
			this.getBucket = bucket;
		}
	}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted, tick.side);
	}

	pushTickForBucket(tick: MarketTick, bucket: number, emitted: MdCandle[]) {
		this.pushTickValuesForBucket(
			tick.time,
			tick.price,
			tick.volume,
			bucket,
			emitted,
			tick.side
		);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		const bucket =
			this.bucketMs === undefined
				? this.requireGetBucket()(time)
				: Math.floor(time / this.bucketMs) * this.bucketMs;
		this.pushTickValuesForBucket(time, price, volume, bucket, emitted, side);
	}

	pushTickValuesForBucket(
		time: number,
		price: number,
		volume: number,
		bucket: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		if (this.current === undefined || this.current.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = createMutableCandleForValues(price, bucket, volume, side);
		} else {
			addTickValues(this.current, price, volume, side);
		}
	}

	finish() {
		const emitted: MdCandle[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandle[]) {
		if (this.current === undefined) {
			return;
		}

		emitted.push(finalizeMutableCandle(this.current, this.pos));
		this.pos++;
		this.current = undefined;
	}

	private requireGetBucket() {
		if (this.getBucket === undefined) {
			throw new Error('Time bucket function is not configured');
		}

		return this.getBucket;
	}
}

export class IntervalTimeAggregator {
	private current: MutableCandle | undefined;

	constructor(
		private readonly bucketMs: number,
		private pos = 0
	) {}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		const bucket = Math.floor(time / this.bucketMs) * this.bucketMs;
		if (this.current === undefined || this.current.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = createMutableCandleForValues(price, bucket, volume, side);
		} else {
			addTickValues(this.current, price, volume, side);
		}
	}

	finish() {
		const emitted: MdCandle[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandle[]) {
		if (this.current === undefined) {
			return;
		}

		emitted.push(finalizeMutableCandle(this.current, this.pos));
		this.pos++;
		this.current = undefined;
	}
}

export class VolumeAggregator {
	private current: MutableCandle | undefined;
	private lastSequenceTime: number | undefined;
	private nextSequenceValue = 0;
	private pos = 0;

	constructor(private readonly targetVolume: number) {}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted, tick.side);
	}

	pushTickValues(
		time: number,
		price: number,
		tickVolume: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		let remaining = tickVolume;
		while (remaining > 0) {
			const volume = Math.min(
				remaining,
				this.targetVolume - (this.current?.volume ?? 0)
			);
			if (this.current === undefined) {
				this.current = createMutableCandleForValues(price, time, volume, side);
			} else {
				addTickValues(this.current, price, volume);
			}

			remaining -= volume;

			if (this.current.volume === this.targetVolume) {
				this.emitCurrent(emitted);
			}
		}
	}

	finish() {
		const emitted: MdCandle[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandle[]) {
		if (this.current === undefined) {
			return;
		}

		const time = this.current.time;

		emitted.push(
			finalizeMutableCandleWithId(
				this.current,
				this.pos,
				createBarId(time, this.nextSequence(time))
			)
		);
		this.pos++;
		this.current = undefined;
	}

	private nextSequence(time: number) {
		if (this.lastSequenceTime === time) {
			const sequence = this.nextSequenceValue;
			this.nextSequenceValue++;

			return sequence;
		}

		this.lastSequenceTime = time;
		this.nextSequenceValue = 1;

		return 0;
	}
}

function createMutableCandleForValues(
	price: number,
	time: number,
	volume: number,
	side: TradeSide | undefined = undefined
): MutableCandle {
	const { bidVolume, askVolume } = splitSideVolume(volume, side);

	return {
		askVolume,
		bidVolume,
		close: price,
		high: price,
		low: price,
		open: price,
		priceVolume: price * volume,
		time,
		volume
	};
}

function addTickValues(
	candle: MutableCandle,
	price: number,
	volume: number,
	side: TradeSide | undefined = undefined
) {
	const { bidVolume, askVolume } = splitSideVolume(volume, side);

	candle.close = price;
	candle.high = Math.max(candle.high, price);
	candle.low = Math.min(candle.low, price);
	candle.priceVolume += price * volume;
	candle.volume += volume;
	candle.bidVolume += bidVolume;
	candle.askVolume += askVolume;
}

function finalizeMutableCandle(candle: MutableCandle, pos: number): MdCandle {
	return finalizeMutableCandleWithId(candle, pos, createBarId(candle.time, 0));
}

function finalizeMutableCandleWithId(
	candle: MutableCandle,
	pos: number,
	id: bigint
): MdCandle {
	return {
		askVolume: candle.askVolume,
		bidVolume: candle.bidVolume,
		close: candle.close,
		high: candle.high,
		id,
		low: candle.low,
		open: candle.open,
		pos,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.priceVolume / candle.volume
	};
}

function finalizeMutablePriceLevelCandle(
	candle: MutableCandle,
	pos: number,
	prices: Map<number, number>
): MdCandleVolumeByPrice {
	return {
		askVolume: candle.askVolume,
		bidVolume: candle.bidVolume,
		close: candle.close,
		high: candle.high,
		id: createBarId(candle.time, 0),
		low: candle.low,
		open: candle.open,
		pos,
		prices,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.priceVolume / candle.volume
	};
}

function splitSideVolume(volume: number, side: TradeSide | undefined) {
	return {
		askVolume: side === 'ask' ? volume : 0,
		bidVolume: side === 'bid' ? volume : 0
	};
}

export function createBarId(time: number, sequence: number) {
	return BigInt(time) * ID_SEQUENCE_MULTIPLIER + BigInt(sequence);
}
