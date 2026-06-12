import { describe, expect, it } from 'vitest';

import { getSymbolConfig } from '../../../contracts/symbols.ts';
import type {
	GeneratedTick,
	GenerationSession
} from '../../../md-generation/pipeline/generation-pipeline.ts';
import { TickStream } from '../../../md-generation/tick-engine/tick-stream.ts';
import { normalizeInputs } from '../../../md-generation/inputs.ts';

describe('TickStream', () => {
	it('generates deterministic tick events for a session', () => {
		const inputs = normalizeInputs({
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: 4
		});
		const symbolConfig = getSymbolConfig(inputs.symbol);
		const session: GenerationSession = {
			generated: true,
			index: 0,
			start: 1_700_000_000_000
		};
		const firstTicks: GeneratedTick[] = [];
		const secondTicks: GeneratedTick[] = [];
		const stream = new TickStream(inputs, symbolConfig);

		const firstClose = stream.generateSession(session, inputs.startPrice, {
			step: (tick) => firstTicks.push(tick)
		});
		const secondClose = stream.generateSession(session, inputs.startPrice, {
			step: (tick) => secondTicks.push(tick)
		});

		expect(secondClose).toBe(firstClose);
		expect(secondTicks).toEqual(firstTicks);
		expect(firstTicks).toHaveLength(inputs.ticksPerSession);
		expect(
			firstTicks.every((tick, index) => tick.session === session && tick.index === index)
		).toBe(true);
	});
});
