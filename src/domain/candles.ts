import { ID_SEQUENCE_MULTIPLIER } from '../contracts/defaults.ts';
import type {
	MarketTick,
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
};

export class PriceLevelAggregator {
	private current:
		| { candle: MutableCandle; prices: Map<number, number> }
		| undefined;
	private pos = 0;

	pushTick(tick: MarketTick, emitted: MdCandleVolumeByPrice[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandleVolumeByPrice[]
	) {
		const bucket = floorTime(time, 1000);
		if (this.current === undefined || this.current.candle.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = {
				candle: createMutableCandleForValues(price, bucket, volume),
				prices: new Map()
			};
		} else {
			addTickValues(this.current.candle, price, volume);
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
		if (this.current === undefined) return;
		emitted.push({
			...finalizeMutableCandle(this.current.candle, this.pos),
			prices: this.current.prices
		});
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
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted);
	}

	pushTickForBucket(tick: MarketTick, bucket: number, emitted: MdCandle[]) {
		this.pushTickValuesForBucket(
			tick.time,
			tick.price,
			tick.volume,
			bucket,
			emitted
		);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[]
	) {
		const bucket =
			this.bucketMs === undefined
				? this.requireGetBucket()(time)
				: Math.floor(time / this.bucketMs) * this.bucketMs;
		this.pushTickValuesForBucket(time, price, volume, bucket, emitted);
	}

	pushTickValuesForBucket(
		time: number,
		price: number,
		volume: number,
		bucket: number,
		emitted: MdCandle[]
	) {
		if (this.current === undefined || this.current.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = createMutableCandleForValues(price, bucket, volume);
		} else {
			addTickValues(this.current, price, volume);
		}
	}

	finish() {
		const emitted: MdCandle[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandle[]) {
		if (this.current === undefined) return;
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
	private pos = 0;

	constructor(private readonly bucketMs: number) {}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[]
	) {
		const bucket = Math.floor(time / this.bucketMs) * this.bucketMs;
		if (this.current === undefined || this.current.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = createMutableCandleForValues(price, bucket, volume);
		} else {
			addTickValues(this.current, price, volume);
		}
	}

	finish() {
		const emitted: MdCandle[] = [];
		this.emitCurrent(emitted);

		return emitted;
	}

	private emitCurrent(emitted: MdCandle[]) {
		if (this.current === undefined) return;
		emitted.push(finalizeMutableCandle(this.current, this.pos));
		this.pos++;
		this.current = undefined;
	}
}

export class VolumeAggregator {
	private current: MutableCandle | undefined;
	private readonly sequences = new Map<number, number>();
	private pos = 0;

	constructor(private readonly targetVolume: number) {}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted);
	}

	pushTickValues(
		time: number,
		price: number,
		tickVolume: number,
		emitted: MdCandle[]
	) {
		let remaining = tickVolume;
		while (remaining > 0) {
			const volume = Math.min(
				remaining,
				this.targetVolume - (this.current?.volume ?? 0)
			);
			if (this.current === undefined) {
				this.current = createMutableCandleForValues(price, time, volume);
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
		if (this.current === undefined) return;
		const time = this.current.time;
		emitted.push({
			...finalizeMutableCandle(this.current, this.pos),
			id: createBarId(time, nextSequence(this.sequences, time))
		});
		this.pos++;
		this.current = undefined;
	}
}

function createMutableCandleForValues(
	price: number,
	time: number,
	volume: number
): MutableCandle {
	return {
		close: price,
		high: price,
		low: price,
		open: price,
		priceVolume: price * volume,
		time,
		volume
	};
}

function addTickValues(candle: MutableCandle, price: number, volume: number) {
	candle.close = price;
	candle.high = Math.max(candle.high, price);
	candle.low = Math.min(candle.low, price);
	candle.priceVolume += price * volume;
	candle.volume += volume;
}

function finalizeMutableCandle(candle: MutableCandle, pos: number): MdCandle {
	return {
		close: candle.close,
		high: candle.high,
		id: createBarId(candle.time, 0),
		low: candle.low,
		open: candle.open,
		pos,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.priceVolume / candle.volume
	};
}

export function createBarId(time: number, sequence: number) {
	return BigInt(time) * ID_SEQUENCE_MULTIPLIER + BigInt(sequence);
}

function nextSequence(sequences: Map<number, number>, time: number) {
	const sequence = sequences.get(time) ?? 0;
	sequences.set(time, sequence + 1);

	return sequence;
}
