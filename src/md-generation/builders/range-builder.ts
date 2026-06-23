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
	pendingOpenRange: PendingOpenRange | undefined;
};

type PendingOpenRange = {
	close: number;
	high: number;
	low: number;
	openSide: RangeSide | undefined;
};

type RangeSide = 'high' | 'low';

export class RangeAggregator {
	private current: MutableRangeCandle | undefined;
	private previousRange: { close: number; high: number; low: number } | undefined;
	private pos = 0;
	private sequence: SequenceState = { lastTime: undefined, nextValue: 0 };

	constructor(
		private readonly rangeTicks: number,
		private readonly tickSize: number,
		private readonly tickDecimals: number
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
		const tickPrice = this.normalizeInputPrice(price);

		if (this.current === undefined) {
			this.current = createMutableRangeCandleForValues(
				tickPrice,
				time,
				volume,
				side,
				tickPrice,
				this.getPendingOpenRange(tickPrice)
			);

			return;
		}

		this.resolvePendingOpenForPrice(this.current, tickPrice);

		if (this.isWithinCurrentRange(tickPrice)) {
			addRangeTickValues(this.current, tickPrice, volume, side);

			return;
		}

		const completed = this.completeCurrentForNextPrice(tickPrice);
		this.emitCompleted(completed, emitted);
		this.current = createMutableRangeCandleForValues(
			this.getNextOpen(completed, tickPrice),
			time,
			volume,
			side,
			tickPrice
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

		const high = Math.max(this.priceToTicks(this.current.high), this.priceToTicks(price));
		const low = Math.min(this.priceToTicks(this.current.low), this.priceToTicks(price));

		return high - low <= this.rangeTicks;
	}

	private completeCurrentForNextPrice(nextPrice: number) {
		const current = this.requireCurrent();
		this.resolvePendingOpen(current);

		if (this.isAbove(nextPrice, current.high)) {
			current.high = this.addTicks(current.low, this.rangeTicks);
		} else if (this.isBelow(nextPrice, current.low)) {
			current.low = this.addTicks(current.high, -this.rangeTicks);
		}

		current.close = this.getAdjustedClose(current, nextPrice);

		return current;
	}

	private completeCurrentAtBoundary(nextOpen: number | undefined) {
		const current = this.requireCurrent();
		this.resolvePendingOpen(current);
		const highTicks = this.priceToTicks(current.high);
		const lowTicks = this.priceToTicks(current.low);
		const currentRange = highTicks - lowTicks;

		if (nextOpen === undefined) {
			return current;
		}

		const nextOpenTicks = this.priceToTicks(this.normalizeInputPrice(nextOpen));

		if (currentRange === 0) {
			if (nextOpenTicks > highTicks && nextOpenTicks - lowTicks > this.rangeTicks) {
				current.high = this.addTicks(current.low, this.rangeTicks);
			} else if (nextOpenTicks < lowTicks && highTicks - nextOpenTicks > this.rangeTicks) {
				current.low = this.addTicks(current.high, -this.rangeTicks);
			}
		} else if (currentRange < this.rangeTicks) {
			if (nextOpenTicks < lowTicks && highTicks - nextOpenTicks > this.rangeTicks) {
				current.low = this.addTicks(current.high, -this.rangeTicks);
			} else if (nextOpenTicks > highTicks && nextOpenTicks - lowTicks > this.rangeTicks) {
				current.high = this.addTicks(current.low, this.rangeTicks);
			}
		}

		current.close = this.getAdjustedClose(current, nextOpenTicks * this.tickSize);

		return current;
	}

	private getAdjustedClose(candle: MutableRangeCandle, nextOpen: number) {
		const distanceToHigh = this.tickDistance(candle.actualClose, candle.high);
		const distanceToLow = this.tickDistance(candle.actualClose, candle.low);

		if (distanceToHigh < distanceToLow) return candle.high;
		if (distanceToLow < distanceToHigh) return candle.low;

		return this.tickDistance(candle.high, nextOpen) < this.tickDistance(candle.low, nextOpen)
			? candle.high
			: candle.low;
	}

	private getNextOpen(completed: MutableRangeCandle, price: number) {
		if (this.isAbove(price, completed.high)) return price;
		if (this.isBelow(price, completed.low)) return price;
		if (this.priceToTicks(price) >= this.priceToTicks(completed.close))
			return this.addTicks(completed.high, 1);

		return this.addTicks(completed.low, -1);
	}

	private getPendingOpenRange(price: number) {
		if (this.previousRange === undefined) return undefined;
		if (this.isAbove(price, this.previousRange.high) || this.isBelow(price, this.previousRange.low))
			return undefined;

		return {
			...this.previousRange,
			openSide: this.getNearestRangeSide(price, this.previousRange)
		};
	}

	private resolvePendingOpen(candle: MutableRangeCandle) {
		const range = candle.pendingOpenRange;
		if (range === undefined) return;

		if (this.isAbove(candle.high, range.high)) {
			this.applyPendingOpen(candle, range, this.getFallbackPendingOpenSide(range));
		} else if (this.isBelow(candle.low, range.low)) {
			this.applyPendingOpen(candle, range, this.getFallbackPendingOpenSide(range));
		} else if (
			this.tickDistance(candle.actualClose, range.high) <
			this.tickDistance(candle.actualClose, range.low)
		) {
			this.applyPendingOpen(candle, range, 'high');
		} else {
			this.applyPendingOpen(candle, range, 'low');
		}

		candle.pendingOpenRange = undefined;
	}

	private resolvePendingOpenForPrice(candle: MutableRangeCandle, price: number) {
		const range = candle.pendingOpenRange;
		if (range === undefined) return;

		if (this.isAbove(price, range.high)) {
			if (this.shouldApplyPendingOpen(range, 'high')) {
				this.applyPendingOpen(candle, range, 'high');
			}
		} else if (this.isBelow(price, range.low)) {
			if (this.shouldApplyPendingOpen(range, 'low')) {
				this.applyPendingOpen(candle, range, 'low');
			}
		} else {
			return;
		}

		candle.pendingOpenRange = undefined;
	}

	private applyPendingOpen(
		candle: MutableRangeCandle,
		range: { high: number; low: number },
		side: RangeSide
	) {
		if (side === 'high') {
			candle.open = this.addTicks(range.high, 1);
			candle.high = Math.max(candle.high, candle.open);

			return;
		}

		candle.open = this.addTicks(range.low, -1);
		candle.low = Math.min(candle.low, candle.open);
	}

	private emitCompleted(candle: MutableRangeCandle, emitted: MdCandle[]) {
		const time = candle.time;
		const normalized = this.normalizeCandle(candle);

		emitted.push(
			finalizeMutableCandleWithId(
				normalized,
				this.pos,
				createBarId(time, nextSequence(this.sequence, time))
			)
		);
		this.previousRange = {
			close: normalized.close,
			high: normalized.high,
			low: normalized.low
		};
		this.pos++;
	}

	private requireCurrent() {
		if (this.current === undefined) {
			throw new Error('Range candle is not initialized');
		}

		return this.current;
	}

	private addTicks(price: number, ticks: number) {
		return this.normalizePrice(price + ticks * this.tickSize);
	}

	private normalizeInputPrice(price: number) {
		return Math.fround(price);
	}

	private normalizePrice(price: number) {
		const factor = 10 ** this.tickDecimals;

		return Math.round(Math.fround(price) * factor) / factor;
	}

	private normalizeCandle(candle: MutableRangeCandle): MutableRangeCandle {
		return {
			...candle,
			close: this.normalizePrice(candle.close),
			high: this.normalizePrice(candle.high),
			low: this.normalizePrice(candle.low),
			open: this.normalizePrice(candle.open)
		};
	}

	private priceToTicks(price: number) {
		return Math.round(price / this.tickSize);
	}

	private tickDistance(first: number, second: number) {
		return Math.abs(this.priceToTicks(first) - this.priceToTicks(second));
	}

	private isAbove(first: number, second: number) {
		return this.priceToTicks(first) > this.priceToTicks(second);
	}

	private isBelow(first: number, second: number) {
		return this.priceToTicks(first) < this.priceToTicks(second);
	}

	private getNearestRangeSide(
		price: number,
		range: { high: number; low: number }
	): RangeSide | undefined {
		const distanceToHigh = this.tickDistance(price, range.high);
		const distanceToLow = this.tickDistance(price, range.low);

		if (distanceToHigh < distanceToLow) return 'high';
		if (distanceToLow < distanceToHigh) return 'low';

		return undefined;
	}

	private getCloseRangeSide(range: { close: number; high: number; low: number }): RangeSide {
		const distanceToHigh = this.tickDistance(range.close, range.high);
		const distanceToLow = this.tickDistance(range.close, range.low);

		return distanceToHigh <= distanceToLow ? 'high' : 'low';
	}

	private getFallbackPendingOpenSide(range: PendingOpenRange): RangeSide {
		return range.openSide ?? this.getCloseRangeSide(range);
	}

	private shouldApplyPendingOpen(range: PendingOpenRange, breakoutSide: RangeSide) {
		const width = this.rangeWidthTicks(range);

		if (width !== this.rangeTicks - 1) return true;
		if (range.openSide === undefined) return true;
		if (range.openSide === breakoutSide) return true;

		return this.getCloseRangeSide(range) === breakoutSide;
	}

	private rangeWidthTicks(range: { high: number; low: number }) {
		return this.priceToTicks(range.high) - this.priceToTicks(range.low);
	}
}

function createMutableRangeCandleForValues(
	open: number,
	time: number,
	volume: number,
	side: TradeSide | undefined = undefined,
	price = open,
	pendingOpenRange: PendingOpenRange | undefined = undefined
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
			symbolConfig.tickSize,
			symbolConfig.tickDecimals
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
