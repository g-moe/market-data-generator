import type { SymbolConfig } from '../../contracts/symbols.ts';
import { TIMEFRAME_DEFINITIONS, type RangeTimeframeKey } from '../../contracts/timeframes.ts';
import type {
	GeneratorInputs,
	MarketTick,
	MdCandle,
	Price,
	TradeSide,
	UnixMs,
	Volume
} from '../../contracts/types.ts';
import {
	addTickValues,
	createBarId,
	createMutableCandleForValues,
	finalizeMutableCandleWithId,
	nextSequence,
	type MutableCandle,
	type SequenceState
} from '../shared/candles.ts';
import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder
} from '../pipeline/generation-pipeline.ts';
import type { StandardRetainedCandleSink } from '../candle-output.ts';
import { getFirstSessionTickPrice, getSessionOpenPrice } from '../tick-engine/session-ticks.ts';

type MutableRangeCandle = MutableCandle & {
	actualClose: number;
	pendingOpenRange: { high: number; low: number } | undefined;
};

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

function createMutableRangeCandleForValues(
	open: number,
	time: number,
	volume: number,
	side: TradeSide | undefined = undefined,
	price = open,
	pendingOpenRange: { high: number; low: number } | undefined = undefined
): MutableRangeCandle {
	const candle = createMutableCandleForValues(price, time, volume, side);

	return {
		...candle,
		actualClose: price,
		high: Math.max(open, price),
		low: Math.min(open, price),
		open,
		pendingOpenRange
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

export class RangeBuilder implements GenerationBuilder {
	private readonly key: RangeTimeframeKey = '10r';
	private readonly aggregator: RangeAggregator;
	private readonly emitted: MdCandle[] = [];
	private sessionClose: Price | undefined;

	constructor(
		private readonly inputs: GeneratorInputs,
		private readonly symbolConfig: SymbolConfig,
		private readonly sessionStarts: UnixMs[],
		private readonly sink: StandardRetainedCandleSink
	) {
		this.aggregator = new RangeAggregator(
			TIMEFRAME_DEFINITIONS[this.key].size,
			symbolConfig.tickSize
		);
	}

	open() {}

	startSession(_session: GenerationSession) {
		void _session;

		this.emitted.length = 0;
		this.sessionClose = undefined;
	}

	step(tick: GeneratedTick) {
		if (!tick.session.generated) return;

		this.stepValues(tick.session, tick.index, tick.time, tick.price, tick.volume, tick.side);
	}

	stepValues(
		_session: GenerationSession,
		_index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) {
		this.pushTickValues(time, price, volume, side);
	}

	pushTickValues(time: UnixMs, price: Price, volume: Volume, side: TradeSide) {
		this.aggregator.pushTickValues(time, price, volume, this.emitted, side);
		this.sessionClose = price;
	}

	finalizeSession(session: GenerationSession) {
		if (session.generated) {
			this.emitted.push(...this.aggregator.finish(this.getNextSessionOpen(session)));
		}

		this.sink.push(this.emitted);
	}

	async finish() {
		this.sink.push(this.aggregator.finish());
		await this.sink.finish();
	}

	close() {}

	summary() {
		return {
			timeframes: {
				[this.key]: this.sink.summary()
			}
		};
	}

	private getNextSessionOpen(session: GenerationSession) {
		const nextSessionIndex = session.index + 1;
		if (this.sessionClose === undefined) return undefined;
		if (nextSessionIndex >= this.inputs.sessionCount) return undefined;
		if (this.sessionStarts[nextSessionIndex] < 0) return undefined;

		const sessionOpenPrice = getSessionOpenPrice(
			this.sessionClose,
			this.inputs,
			this.symbolConfig,
			nextSessionIndex
		);

		return getFirstSessionTickPrice(
			this.inputs,
			this.symbolConfig,
			nextSessionIndex,
			sessionOpenPrice
		);
	}
}
