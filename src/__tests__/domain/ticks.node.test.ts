import { describe, expect, it } from 'vitest';

import { getSymbolConfig } from '../../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../../contracts/types.ts';
import { normalizeInputs } from '../../domain/inputs.ts';
import { getSessionStart } from '../../domain/market-time.ts';
import {
	deriveSessionSeed,
	generateSessionTicksForStart
} from '../../domain/ticks.ts';

describe('generateSessionTicksForStart', () => {
	it('generates deterministic ES ticks for a session', () => {
		const inputs = normalizeInputs({
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 5
		});

		expect(collectSessionTicks(inputs, 0)).toEqual(
			collectSessionTicks(inputs, 0)
		);
	});

	it('keeps prices aligned to the symbol tick size', () => {
		const inputs = normalizeInputs({
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: 20
		});
		const symbol = getSymbolConfig(inputs.symbol);
		const ticks = collectSessionTicks(inputs, 0);

		expect(
			ticks.every((tick) => {
				return Number.isInteger(tick.price / symbol.tickSize);
			})
		).toBe(true);
	});

	it('supports one-tick sessions and larger deterministic volume samples', () => {
		const inputs = normalizeInputs({
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: 1
		});
		const oneTick = collectSessionTicks(inputs, 0);
		const manyTicks = collectSessionTicks(
			{ ...inputs, ticksPerSession: 5_000 },
			0
		);

		expect(oneTick).toHaveLength(1);
		expect(manyTicks.some((tick) => tick.volume > 250)).toBe(true);
		expect(
			manyTicks.some((tick) => tick.volume > 25 && tick.volume <= 250)
		).toBe(true);
	});

	it('derives distinct deterministic seeds per session', () => {
		expect(deriveSessionSeed(1, 'ES', 1)).toBe(deriveSessionSeed(1, 'ES', 1));
		expect(deriveSessionSeed(1, 'ES', 1)).not.toBe(
			deriveSessionSeed(1, 'ES', 2)
		);
	});
});

function collectSessionTicks(
	inputs: GeneratorInputs,
	sessionIndex: number
): MarketTick[] {
	const symbol = getSymbolConfig(inputs.symbol);
	const sessionStart = getSessionStart(
		inputs.anchorIso,
		inputs.sessionCount - sessionIndex - 1
	);
	const ticks: MarketTick[] = [];
	generateSessionTicksForStart(
		inputs,
		symbol,
		sessionIndex,
		sessionStart,
		(tick) => ticks.push(tick)
	);

	return ticks;
}
