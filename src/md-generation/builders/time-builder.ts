import { TIMEFRAME_DEFINITIONS, type TimeTimeframeKey } from '../../contracts/timeframes.ts';
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
	createMutableCandleForValues,
	finalizeMutableCandle,
	type MutableCandle
} from '../shared/candles.ts';
import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder
} from '../pipeline/generation-pipeline.ts';
import type { StandardRetainedCandleSink } from '../candle-output.ts';
import { countGeneratedTickTimeBuckets } from '../tick-engine/session-ticks.ts';

export class TimeAggregator {
	private current: MutableCandle | undefined;
	private readonly bucketMs: number | undefined;
	private readonly getBucket: ((time: number) => number) | undefined;

	constructor(
		bucket: ((time: number) => number) | number,
		private pos = 0
	) {
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

export class TimeBuilder<Key extends TimeTimeframeKey> implements GenerationBuilder {
	private active = false;
	private readonly aggregator: TimeAggregator;
	private readonly emitted: MdCandle[] = [];
	private priceLevelRetained = false;
	private readonly startSessionIndex: number;

	constructor(
		private readonly key: Key,
		private readonly sink: StandardRetainedCandleSink,
		private readonly inputs: GeneratorInputs,
		retainedBars: number,
		private readonly priceLevelRetainSessions: number,
		private readonly omitSideWhenPriceLevelRetained = false
	) {
		const bucketMs = TIMEFRAME_DEFINITIONS[key].milliseconds;
		const barsPerSession = countGeneratedTickTimeBuckets(inputs.ticksPerSession, bucketMs);
		this.startSessionIndex = Math.max(
			0,
			inputs.sessionCount - Math.ceil(retainedBars / barsPerSession)
		);
		this.aggregator = new TimeAggregator(bucketMs, this.startSessionIndex * barsPerSession);
	}

	open() {}

	startSession(session: GenerationSession) {
		this.emitted.length = 0;
		this.active = session.generated && session.index >= this.startSessionIndex;
		this.priceLevelRetained =
			session.index >= Math.max(0, this.inputs.sessionCount - this.priceLevelRetainSessions);
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
		this.aggregator.pushTickValues(
			time,
			price,
			volume,
			this.emitted,
			this.omitSideWhenPriceLevelRetained && this.priceLevelRetained ? undefined : side
		);
	}

	finalizeSession(_session: GenerationSession) {
		void _session;

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
}
