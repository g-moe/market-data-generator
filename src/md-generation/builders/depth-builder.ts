import { MarketDepthSessionWriter } from '../../shared/file-ops/depth.ts';
import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder
} from '../pipeline/generation-pipeline.ts';
import type { Price, TradeSide, UnixMs, Volume } from '../../contracts/types.ts';
import { OrderbookDepthStreamer } from './depth-orderbook.ts';

export class DepthBuilder implements GenerationBuilder {
	private active = false;
	private readonly streamer: OrderbookDepthStreamer;

	constructor(
		private readonly writer: MarketDepthSessionWriter,
		tickSize: number,
		private readonly retainSessions: number,
		private readonly sessionCount: number
	) {
		this.streamer = new OrderbookDepthStreamer(writer, tickSize);
	}

	async open() {
		await this.writer.open();
	}

	async startSession(session: GenerationSession) {
		this.active = session.generated && this.isRetained(session);
		if (!this.active) return;

		await this.writer.startSession(session.start);
		this.streamer.reset();
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
		this.streamer.pushTickValues(time, price, volume, side);
	}

	finalizeSession(_session: GenerationSession) {
		void _session;
	}

	finish() {}

	async close() {
		await this.writer.close();
	}

	summary() {
		return {
			orderbook: this.writer.recordCount
		};
	}

	private isRetained(session: GenerationSession) {
		return session.index >= Math.max(0, this.sessionCount - this.retainSessions);
	}
}
