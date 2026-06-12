import { TIMEFRAME_DEFINITIONS, type TickTimeframeKey } from '../../contracts/timeframes.ts';
import type {
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

export class TickBuilder implements GenerationBuilder {
	private readonly key: TickTimeframeKey = '100t';
	private readonly aggregator = new TickAggregator(TIMEFRAME_DEFINITIONS[this.key].size);
	private readonly emitted: MdCandle[] = [];

	constructor(private readonly sink: StandardRetainedCandleSink) {}

	open() {}

	startSession(_session: GenerationSession) {
		void _session;

		this.emitted.length = 0;
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
	}

	finalizeSession(session: GenerationSession) {
		if (session.generated) {
			this.emitted.push(...this.aggregator.finish());
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
}
