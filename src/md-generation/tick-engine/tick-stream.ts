import type { SymbolConfig } from '../../contracts/symbols.ts';
import type { GeneratorInputs, Price, TradeSide, UnixMs, Volume } from '../../contracts/types.ts';
import type { GeneratedTick, GenerationSession } from '../pipeline/generation-pipeline.ts';
import { generateSessionTickValuesForStart } from './session-ticks.ts';

type TickSink = {
	step: (tick: GeneratedTick) => void;
	stepValues?: (
		session: GenerationSession,
		index: number,
		time: UnixMs,
		price: Price,
		volume: Volume,
		side: TradeSide
	) => void;
};

export class TickStream {
	constructor(
		private readonly inputs: GeneratorInputs,
		private readonly symbolConfig: SymbolConfig
	) {}

	generateSession(session: GenerationSession, sessionStartPrice: Price, sink: TickSink) {
		const stepValues = sink.stepValues?.bind(sink);

		if (stepValues === undefined) {
			return generateSessionTickValuesForStart(
				this.inputs,
				this.symbolConfig,
				session.index,
				session.start,
				sessionStartPrice,
				(index, time, price, volume, side) => {
					sink.step({
						index,
						price,
						session,
						side,
						time,
						volume
					});
				}
			);
		}

		return generateSessionTickValuesForStart(
			this.inputs,
			this.symbolConfig,
			session.index,
			session.start,
			sessionStartPrice,
			(index, time, price, volume, side) => {
				stepValues(session, index, time, price, volume, side);
			}
		);
	}
}
