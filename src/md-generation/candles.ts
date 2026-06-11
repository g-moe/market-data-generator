import { ID_SEQUENCE_MULTIPLIER } from '../contracts/defaults.ts';
import type { MarketTick, TradeSide, MdCandle, MdCandleVolumeByPrice } from '../contracts/types.ts';
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

type MutableRangeCandle = MutableCandle & {
	actualClose: number;
	pendingOpenRange: { high: number; low: number } | undefined;
};

type SequenceState = {
	lastTime: number | undefined;
	nextValue: number;
};

export class PriceLevelAggregator {
	private current: { candle: MutableCandle; prices: Map<number, number> } | undefined;
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

		this.current.prices.set(price, (this.current.prices.get(price) ?? 0) + volume);
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
			finalizeMutablePriceLevelCandle(this.current.candle, this.pos, this.current.prices)
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
		this.pushTickValuesForBucket(tick.time, tick.price, tick.volume, bucket, emitted, tick.side);
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
	private pos = 0;
	private sequence: SequenceState = { lastTime: undefined, nextValue: 0 };

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
			const volume = Math.min(remaining, this.targetVolume - (this.current?.volume ?? 0));
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
				createBarId(time, nextSequence(this.sequence, time))
			)
		);
		this.pos++;
		this.current = undefined;
	}
}

export class TickAggregator {
	private current: MutableCandle | undefined;
	private pos = 0;
	private sequence: SequenceState = { lastTime: undefined, nextValue: 0 };
	private tickCount = 0;

	constructor(private readonly targetTicks: number) {}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted, tick.side);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		if (this.current === undefined) {
			this.current = createMutableCandleForValues(price, time, volume, side);
		} else {
			addTickValues(this.current, price, volume, side);
		}

		this.tickCount++;

		if (this.tickCount === this.targetTicks) {
			this.emitCurrent(emitted);
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
				createBarId(time, nextSequence(this.sequence, time))
			)
		);
		this.pos++;
		this.current = undefined;
		this.tickCount = 0;
	}
}

export class RangeAggregator {
	private current: MutableRangeCandle | undefined;
	private previousRange: { high: number; low: number } | undefined;
	private pos = 0;
	private sequence: SequenceState = { lastTime: undefined, nextValue: 0 };

	constructor(
		private readonly rangeTicks: number,
		private readonly tickSize: number
	) {}

	pushTick(tick: MarketTick, emitted: MdCandle[]) {
		this.pushTickValues(tick.time, tick.price, tick.volume, emitted, tick.side);
	}

	pushTickValues(
		time: number,
		price: number,
		volume: number,
		emitted: MdCandle[],
		side: TradeSide | undefined = undefined
	) {
		if (this.current === undefined) {
			this.current = createMutableRangeCandleForValues(
				price,
				time,
				volume,
				side,
				price,
				this.getPendingOpenRange(price)
			);

			return;
		}

		if (this.isWithinCurrentRange(price)) {
			addRangeTickValues(this.current, price, volume, side);

			return;
		}

		const completed = this.completeCurrentForNextPrice(price);
		this.emitCompleted(completed, emitted);
		this.current = createMutableRangeCandleForValues(
			this.getNextOpen(completed, price),
			time,
			volume,
			side,
			price
		);
	}

	finish(nextOpen: number | undefined = undefined) {
		const emitted: MdCandle[] = [];
		if (this.current !== undefined) {
			this.emitCompleted(this.completeCurrentAtBoundary(nextOpen), emitted);
			this.current = undefined;
		}

		return emitted;
	}

	private isWithinCurrentRange(price: number) {
		if (this.current === undefined) return true;

		return (
			Math.max(this.current.high, price) - Math.min(this.current.low, price) <=
			this.rangeTicks * this.tickSize
		);
	}

	private completeCurrentForNextPrice(nextPrice: number) {
		const current = this.requireCurrent();
		this.resolvePendingOpen(current);
		const range = this.rangeTicks * this.tickSize;

		if (nextPrice > current.high) {
			current.high = current.low + range;
		} else if (nextPrice < current.low) {
			current.low = current.high - range;
		}

		current.close = this.getAdjustedClose(current, nextPrice);

		return current;
	}

	private completeCurrentAtBoundary(nextOpen: number | undefined) {
		const current = this.requireCurrent();
		this.resolvePendingOpen(current);
		const range = this.rangeTicks * this.tickSize;
		const currentRange = current.high - current.low;

		if (nextOpen === undefined) {
			return current;
		}

		if (currentRange === 0) {
			if (nextOpen > current.high && current.low + range < nextOpen) {
				current.high = current.low + range;
			} else if (nextOpen < current.low && current.high - range > nextOpen) {
				current.low = current.high - range;
			}
		} else if (currentRange < range) {
			if (nextOpen < current.low && current.high - range > nextOpen) {
				current.low = current.high - range;
			} else if (nextOpen > current.high && current.low + range < nextOpen) {
				current.high = current.low + range;
			}
		}

		current.close = this.getAdjustedClose(current, nextOpen);

		return current;
	}

	private getAdjustedClose(candle: MutableRangeCandle, nextOpen: number) {
		const distanceToHigh = Math.abs(candle.actualClose - candle.high);
		const distanceToLow = Math.abs(candle.actualClose - candle.low);

		if (distanceToHigh < distanceToLow) return candle.high;
		if (distanceToLow < distanceToHigh) return candle.low;

		return Math.abs(candle.high - nextOpen) < Math.abs(candle.low - nextOpen)
			? candle.high
			: candle.low;
	}

	private getNextOpen(completed: MutableRangeCandle, price: number) {
		if (price > completed.high) return price;
		if (price < completed.low) return price;
		if (price >= completed.close) return completed.high + this.tickSize;

		return completed.low - this.tickSize;
	}

	private getPendingOpenRange(price: number) {
		if (this.previousRange === undefined) return undefined;
		if (price > this.previousRange.high || price < this.previousRange.low) return undefined;

		return this.previousRange;
	}

	private resolvePendingOpen(candle: MutableRangeCandle) {
		const range = candle.pendingOpenRange;
		if (range === undefined) return;

		if (candle.high > range.high) {
			candle.open = range.high + this.tickSize;
			candle.high = Math.max(candle.high, candle.open);
		} else if (candle.low < range.low) {
			candle.open = range.low - this.tickSize;
			candle.low = Math.min(candle.low, candle.open);
		} else if (
			Math.abs(candle.actualClose - range.high) < Math.abs(candle.actualClose - range.low)
		) {
			candle.open = range.high + this.tickSize;
			candle.high = Math.max(candle.high, candle.open);
		} else {
			candle.open = range.low - this.tickSize;
			candle.low = Math.min(candle.low, candle.open);
		}

		candle.pendingOpenRange = undefined;
	}

	private emitCompleted(candle: MutableRangeCandle, emitted: MdCandle[]) {
		const time = candle.time;

		emitted.push(
			finalizeMutableCandleWithId(
				candle,
				this.pos,
				createBarId(time, nextSequence(this.sequence, time))
			)
		);
		this.previousRange = { high: candle.high, low: candle.low };
		this.pos++;
	}

	private requireCurrent() {
		if (this.current === undefined) {
			throw new Error('Range candle is not initialized');
		}

		return this.current;
	}
}

function nextSequence(state: SequenceState, time: number) {
	if (state.lastTime === time) {
		const sequence = state.nextValue;
		state.nextValue++;

		return sequence;
	}

	state.lastTime = time;
	state.nextValue = 1;

	return 0;
}

function createMutableRangeCandleForValues(
	open: number,
	time: number,
	volume: number,
	side: TradeSide | undefined = undefined,
	price = open,
	pendingOpenRange: { high: number; low: number } | undefined = undefined
): MutableRangeCandle {
	const candle = createMutableCandleForValues(price, time, volume, side) as MutableRangeCandle;

	candle.open = open;
	candle.high = Math.max(open, price);
	candle.low = Math.min(open, price);
	candle.actualClose = price;
	candle.pendingOpenRange = pendingOpenRange;

	return candle;
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

function addRangeTickValues(
	candle: MutableRangeCandle,
	price: number,
	volume: number,
	side: TradeSide | undefined = undefined
) {
	addTickValues(candle, price, volume, side);
	candle.actualClose = price;
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

function finalizeMutableCandleWithId(candle: MutableCandle, pos: number, id: bigint): MdCandle {
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
