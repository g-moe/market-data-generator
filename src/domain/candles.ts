import { ID_SEQUENCE_MULTIPLIER } from '../contracts/defaults.ts';
import type {
	MarketTick,
	MdCandle,
	MdCandleVolumeByPrice,
	Price,
	Volume
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
		| { candle: MutableCandle; prices: Map<Price, Volume> }
		| undefined;
	private pos = 0;

	pushTick(tick: MarketTick, emitted: MdCandleVolumeByPrice[]) {
		const bucket = floorTime(tick.time, 1000);
		if (this.current === undefined || this.current.candle.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = {
				candle: createMutableCandle(tick, bucket),
				prices: new Map()
			};
		} else {
			addTick(this.current.candle, tick);
		}

		this.current.prices.set(
			tick.price,
			(this.current.prices.get(tick.price) ?? 0) + tick.volume
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

	constructor(private readonly getBucket: (time: number) => number) {}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickForBucket(tick, this.getBucket(tick.time), emitted);
	}

	pushTickForBucket(tick: MarketTick, bucket: number, emitted: MdCandle[]) {
		if (this.current === undefined || this.current.time !== bucket) {
			this.emitCurrent(emitted);
			this.current = createMutableCandle(tick, bucket);
		} else {
			addTick(this.current, tick);
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
		let remaining = tick.volume;
		while (remaining > 0) {
			const volume = Math.min(
				remaining,
				this.targetVolume - (this.current?.volume ?? 0)
			);
			const piece = { ...tick, volume };
			if (this.current === undefined) {
				this.current = createMutableCandle(piece, tick.time);
			} else {
				addTick(this.current, piece);
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

function createMutableCandle(tick: MarketTick, time: number): MutableCandle {
	return {
		close: tick.price,
		high: tick.price,
		low: tick.price,
		open: tick.price,
		priceVolume: tick.price * tick.volume,
		time,
		volume: tick.volume
	};
}

function addTick(candle: MutableCandle, tick: MarketTick) {
	candle.close = tick.price;
	candle.high = Math.max(candle.high, tick.price);
	candle.low = Math.min(candle.low, tick.price);
	candle.priceVolume += tick.price * tick.volume;
	candle.volume += tick.volume;
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
