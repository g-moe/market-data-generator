import type { SymbolConfig } from '../../contracts/symbols.ts';
import type { RetainedCandleTimeframeKey } from '../../contracts/timeframes.ts';
import type {
	GeneratorInputs,
	OutputFiles,
	Price,
	TradeSide,
	UnixMs,
	Volume
} from '../../contracts/types.ts';
import { MarketDepthSessionWriter } from '../../shared/file-ops/depth.ts';
import { ScidTickWriter } from '../../shared/file-ops/scid.ts';
import { DailyBuilder } from '../builders/daily-builder.ts';
import { DepthBuilder } from '../builders/depth-builder.ts';
import { PriceLevelBuilder } from '../builders/price-level-builder.ts';
import { RangeBuilder } from '../builders/range-builder.ts';
import { ScidBuilder } from '../builders/scid-builder.ts';
import { TickBuilder } from '../builders/tick-builder.ts';
import { TimeBuilder } from '../builders/time-builder.ts';
import { VolumeBuilder } from '../builders/volume-builder.ts';
import {
	createRetainedCandleSink,
	createRetainedPriceLevelSink,
	createStreamingCandleSink
} from '../candle-output.ts';
import { createRetainedTimeWindow } from '../shared/retained-time-window.ts';
import type {
	BuilderSummary,
	GeneratedTick,
	GenerationBuilder,
	GenerationSession,
	PipelineSummary
} from './generation-pipeline.ts';
import { DEPTH_RETAINED_SESSION_COUNT, RETAINED_CANDLE_BAR_COUNT } from './pipeline-constants.ts';

export function createMarketDataPipeline(config: {
	files: OutputFiles;
	inputs: GeneratorInputs;
	sessionStarts: GenerationSession[];
	symbolConfig: SymbolConfig;
}) {
	const rawSessionStarts = config.sessionStarts.map((session) => session.start);
	const createRetainedSink = (key: RetainedCandleTimeframeKey) =>
		createRetainedCandleSink(config.files.timeframes[key], key, RETAINED_CANDLE_BAR_COUNT);

	const scid = new ScidBuilder(new ScidTickWriter(config.files.scids['1d']));
	const depth = new DepthBuilder(
		new MarketDepthSessionWriter(config.files.orderbook, config.symbolConfig.symbolId),
		config.symbolConfig.tickSize,
		DEPTH_RETAINED_SESSION_COUNT,
		config.inputs.sessionCount
	);
	const daily = new DailyBuilder(createStreamingCandleSink(config.files.timeframes['1d'], '1d'));
	const priceLevel = new PriceLevelBuilder(
		createRetainedPriceLevelSink(config.files.timeframes['1s'], RETAINED_CANDLE_BAR_COUNT),
		createRetainedTimeWindow('1s', config.inputs, RETAINED_CANDLE_BAR_COUNT)
	);
	const seconds15 = new TimeBuilder(
		'15s',
		createRetainedSink('15s'),
		createRetainedTimeWindow('15s', config.inputs, RETAINED_CANDLE_BAR_COUNT)
	);
	const minutes5 = new TimeBuilder(
		'5m',
		createRetainedSink('5m'),
		createRetainedTimeWindow('5m', config.inputs, RETAINED_CANDLE_BAR_COUNT)
	);
	const range10 = new RangeBuilder(
		config.inputs,
		config.symbolConfig,
		rawSessionStarts,
		createRetainedSink('10r')
	);
	const tick100 = new TickBuilder(createRetainedSink('100t'));
	const volume500 = new VolumeBuilder(createRetainedSink('500v'));

	return new MarketDataPipeline(
		scid,
		depth,
		daily,
		priceLevel,
		seconds15,
		minutes5,
		range10,
		tick100,
		volume500
	);
}

class MarketDataPipeline implements GenerationBuilder {
	private depthActive = false;
	private dailyActive = false;
	private minutes5Active = false;
	private priceLevelActive = false;
	private seconds15Active = false;
	private readonly builders: GenerationBuilder[];

	constructor(
		private readonly scid: ScidBuilder,
		private readonly depth: DepthBuilder,
		private readonly daily: DailyBuilder,
		private readonly priceLevel: PriceLevelBuilder,
		private readonly seconds15: TimeBuilder<'15s'>,
		private readonly minutes5: TimeBuilder<'5m'>,
		private readonly range10: RangeBuilder,
		private readonly tick100: TickBuilder,
		private readonly volume500: VolumeBuilder
	) {
		this.builders = [
			scid,
			depth,
			daily,
			priceLevel,
			seconds15,
			minutes5,
			range10,
			tick100,
			volume500
		];
	}

	async open() {
		for (const builder of this.builders) {
			await builder.open();
		}
	}

	async startSession(session: GenerationSession) {
		for (const builder of this.builders) {
			await builder.startSession(session);
		}

		this.depthActive = this.depth.isTickActive();
		this.dailyActive = this.daily.isTickActive();
		this.minutes5Active = this.minutes5.isTickActive();
		this.priceLevelActive = this.priceLevel.isTickActive();
		this.seconds15Active = this.seconds15.isTickActive();
	}

	step(tick: GeneratedTick) {
		if (!tick.session.generated) return;

		this.stepValues(tick.session, tick.index, tick.time, tick.price, tick.volume, tick.side);
	}

	stepValues(
		_session: GenerationSession,
		index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) {
		this.scid.pushTickValues(time, price, volume, side);

		if (this.depthActive) {
			this.depth.pushTickValues(time, price, volume, side);
		}

		if (this.dailyActive) {
			this.daily.pushTickValues(index, price, volume, side);
		}

		if (this.priceLevelActive) {
			this.priceLevel.pushTickValues(time, price, volume, side);
		}

		if (this.seconds15Active) {
			this.seconds15.pushTickValues(time, price, volume, side);
		}

		if (this.minutes5Active) {
			this.minutes5.pushTickValues(time, price, volume, side);
		}

		this.range10.pushTickValues(time, price, volume, side);
		this.tick100.pushTickValues(time, price, volume, side);
		this.volume500.pushTickValues(time, price, volume, side);
	}

	async finalizeSession(session: GenerationSession) {
		for (const builder of this.builders) {
			await builder.finalizeSession(session);
		}
	}

	async finish() {
		for (const builder of this.builders) {
			await builder.finish();
		}
	}

	async close() {
		for (const builder of this.builders.toReversed()) {
			await builder.close();
		}
	}

	summary(): PipelineSummary {
		const summary: PipelineSummary = {
			orderbook: 0,
			timeframes: {}
		};

		for (const builder of this.builders) {
			addBuilderSummary(summary, builder.summary());
		}

		return summary;
	}
}

function addBuilderSummary(summary: PipelineSummary, builderSummary: BuilderSummary) {
	if (builderSummary.orderbook !== undefined) {
		summary.orderbook += builderSummary.orderbook;
	}

	Object.assign(summary.timeframes, builderSummary.timeframes);
}
