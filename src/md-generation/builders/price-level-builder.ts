import { TIMEFRAME_DEFINITIONS, type PriceLevelTimeframeKey } from '../../contracts/timeframes.ts';
import type {
	MarketTick,
	MdCandleVolumeByPrice,
	Price,
	TradeSide,
	UnixMs,
	Volume
} from '../../contracts/types.ts';
import {
	addTickValues,
	createBarId,
	createMutableCandleForValues,
	type MutableCandle
} from '../shared/candles.ts';
import { floorTime } from '../shared/market-time.ts';
import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder
} from '../pipeline/generation-pipeline.ts';
import type { PriceLevelStreamingCandleSink } from '../candle-output.ts';

export class PriceLevelAggregator {
	private current: { candle: MutableCandle; prices: Map<number, number> } | undefined;
	private pos = 0;
	private readonly bucketMs = TIMEFRAME_DEFINITIONS['1s'].milliseconds;

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
		const bucket = floorTime(time, this.bucketMs);
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

export class PriceLevelBuilder implements GenerationBuilder {
	private active = false;
	private readonly aggregator = new PriceLevelAggregator();
	private readonly emitted: MdCandleVolumeByPrice[] = [];
	private readonly key: PriceLevelTimeframeKey = '1s';

	constructor(
		private readonly sink: PriceLevelStreamingCandleSink,
		private readonly retainSessions: number,
		private readonly sessionCount: number
	) {}

	async open() {
		await this.sink.open();
	}

	startSession(session: GenerationSession) {
		this.emitted.length = 0;
		this.active = session.generated && this.isRetained(session);
	}

	isTickActive() {
		return this.active;
	}

	step(tick: GeneratedTick) {
		if (!this.active) return;

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
	}

	async finalizeSession(_session: GenerationSession) {
		void _session;

		await this.sink.write(this.emitted);
	}

	async finish() {
		await this.sink.write(this.aggregator.finish());
	}

	async close() {
		await this.sink.close();
	}

	summary() {
		return {
			timeframes: {
				[this.key]: this.sink.summary()
			}
		};
	}

	private isRetained(session: GenerationSession) {
		return session.index >= Math.max(0, this.sessionCount - this.retainSessions);
	}
}
