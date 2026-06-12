import type {
	GeneratedTick,
	GenerationSession,
	GenerationBuilder
} from '../pipeline/generation-pipeline.ts';
import type { Price, TradeSide, UnixMs, Volume } from '../../contracts/types.ts';
import { SCID_EPOCH_OFFSET_MS, ScidTickWriter } from '../../shared/file-ops/scid.ts';

export class ScidBuilder implements GenerationBuilder {
	constructor(private readonly writer: ScidTickWriter) {}

	async open() {
		await this.writer.open();
	}

	startSession(_session: GenerationSession) {
		void _session;
	}

	step(tick: GeneratedTick) {
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
		const isAsk = side === 'ask';

		this.writer.pushScDateTimeMsVolumeValues(
			(time - SCID_EPOCH_OFFSET_MS) * 1000,
			price,
			volume,
			isAsk ? 0 : volume,
			isAsk ? volume : 0
		);
	}

	finalizeSession(_session: GenerationSession) {
		void _session;
	}

	finish() {}

	async close() {
		await this.writer.close();
	}

	summary() {
		return {};
	}
}
