import type { TimeframeKey } from '../../contracts/timeframes.ts';
import type { Price, TradeSide, UnixMs, Volume } from '../../contracts/types.ts';

export type GenerationSession = {
	generated: boolean;
	index: number;
	start: UnixMs;
};

export type GeneratedTick = {
	index: number;
	price: Price;
	session: GenerationSession;
	side: TradeSide;
	time: UnixMs;
	volume: Volume;
};

export type TimeRange = {
	endTime: UnixMs;
	startTime: UnixMs;
};

export type TimeframeBuilderSummary = {
	count: number;
	range: TimeRange;
};

export type BuilderSummary = {
	orderbook?: number;
	timeframes?: Partial<Record<TimeframeKey, TimeframeBuilderSummary>>;
};

export type PipelineSummary = {
	orderbook: number;
	timeframes: Partial<Record<TimeframeKey, TimeframeBuilderSummary>>;
};

type TickValueBuilder = GenerationBuilder & {
	stepValues: (
		session: GenerationSession,
		index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) => void;
};

export type GenerationBuilder = {
	close: () => Promise<void> | void;
	finalizeSession: (session: GenerationSession) => Promise<void> | void;
	finish: () => Promise<void> | void;
	isTickActive?: () => boolean;
	open: () => Promise<void> | void;
	startSession: (session: GenerationSession) => Promise<void> | void;
	step: (tick: GeneratedTick) => void;
	stepValues?: (
		session: GenerationSession,
		index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) => void;
	summary: () => BuilderSummary;
};

export class GenerationPipeline implements GenerationBuilder {
	private activeObjectBuilders: GenerationBuilder[] = [];
	private activeValueBuilders: TickValueBuilder[] = [];

	constructor(private readonly builders: GenerationBuilder[]) {
		this.activeObjectBuilders = builders;
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

		this.activeObjectBuilders = [];
		this.activeValueBuilders = [];

		for (const builder of this.builders) {
			if (builder.isTickActive?.() === false) continue;

			if (builder.stepValues === undefined) {
				this.activeObjectBuilders.push(builder);
			} else {
				this.activeValueBuilders.push(builder as TickValueBuilder);
			}
		}
	}

	step(tick: GeneratedTick) {
		for (const builder of this.activeValueBuilders) {
			builder.stepValues(tick.session, tick.index, tick.time, tick.price, tick.volume, tick.side);
		}

		for (const builder of this.activeObjectBuilders) {
			builder.step(tick);
		}
	}

	stepValues(
		session: GenerationSession,
		index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) {
		for (const builder of this.activeValueBuilders) {
			builder.stepValues(session, index, time, price, volume, side);
		}

		if (this.activeObjectBuilders.length === 0) {
			return;
		}

		const tick = {
			index,
			price,
			session,
			side,
			time,
			volume
		};

		for (const builder of this.activeObjectBuilders) {
			builder.step(tick);
		}
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
			const builderSummary = builder.summary();

			if (builderSummary.orderbook !== undefined) {
				summary.orderbook += builderSummary.orderbook;
			}

			Object.assign(summary.timeframes, builderSummary.timeframes);
		}

		return summary;
	}
}
