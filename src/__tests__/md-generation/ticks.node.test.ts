import { describe, expect, it } from 'vitest';

import { getSymbolConfig } from '../../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../../contracts/types.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import { getSessionStart } from '../../md-generation/market-time.ts';
import {
	countGeneratedTickTimeBuckets,
	deriveSessionSeed,
	generateSessionTicksForStart,
	getFirstSessionTickPrice,
	getSessionOpenPrice,
	TARGET_TICKS_PER_ACTIVE_SECOND
} from '../../md-generation/ticks.ts';

describe('generateSessionTicksForStart', () => {
	it('generates deterministic ES ticks for a session', () => {
		const inputs = normalizeInputs({
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 5
		});

		expect(collectSessionTicks(inputs, 0)).toEqual(collectSessionTicks(inputs, 0));
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

	it('clusters generated ticks into deterministic active seconds', () => {
		const inputs = normalizeInputs({
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: TARGET_TICKS_PER_ACTIVE_SECOND * 2
		});
		const ticks = collectSessionTicks(inputs, 0);
		const buckets = ticks.map((tick) => Math.floor(tick.time / 1000));

		expect(new Set(buckets)).toHaveLength(2);
		expect(new Set(buckets.slice(0, TARGET_TICKS_PER_ACTIVE_SECOND))).toHaveLength(1);
		expect(countGeneratedTickTimeBuckets(inputs.ticksPerSession, 1000)).toBe(2);
	});

	it('carries the previous close into the next session open with a small deterministic gap', () => {
		const inputs = normalizeInputs({
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 5
		});
		const first = collectSessionTicks(inputs, 0);
		const firstClose = first.at(-1)?.price;
		expect(firstClose).toBeDefined();

		const secondOpen = getSessionOpenPrice(
			firstClose ?? inputs.startPrice,
			inputs,
			getSymbolConfig(inputs.symbol),
			1
		);
		const second = collectSessionTicks(inputs, 1, secondOpen);

		expect(Math.abs(second[0].price - (firstClose ?? 0))).toBeLessThanOrEqual(1);
		expect(second).toEqual(collectSessionTicks(inputs, 1, secondOpen));
	});

	it('does not grow session gaps with session history length', () => {
		const inputs = normalizeInputs({
			sessionCount: 20_000,
			symbol: 'ES',
			ticksPerSession: 1
		});
		const symbol = getSymbolConfig(inputs.symbol);
		const previousClose = 5800;
		const nextOpen = getSessionOpenPrice(previousClose, inputs, symbol, 19_999);

		expect(Math.abs(nextOpen - previousClose)).toBeLessThanOrEqual(4);
	});

	it('supports one-tick sessions and larger deterministic volume samples', () => {
		const inputs = normalizeInputs({
			sessionCount: 1,
			symbol: 'ES',
			ticksPerSession: 1
		});
		const oneTick = collectSessionTicks(inputs, 0);
		const manyTicks = collectSessionTicks({ ...inputs, ticksPerSession: 5_000 }, 0);

		expect(oneTick).toHaveLength(1);
		expect(manyTicks.some((tick) => tick.volume > 250)).toBe(true);
		expect(manyTicks.some((tick) => tick.volume > 25 && tick.volume <= 250)).toBe(true);
	});

	it('returns the first generated tick price for a session start', () => {
		const inputs = normalizeInputs({
			sessionCount: 2,
			symbol: 'NQ',
			ticksPerSession: 5
		});
		const symbol = getSymbolConfig(inputs.symbol);
		const sessionStartPrice = 18_000;
		const ticks = collectSessionTicks(inputs, 1, sessionStartPrice);

		expect(getFirstSessionTickPrice(inputs, symbol, 1, sessionStartPrice)).toBe(ticks[0].price);
	});

	it('derives distinct deterministic seeds per session', () => {
		expect(deriveSessionSeed(1, 'ES', 1)).toBe(deriveSessionSeed(1, 'ES', 1));
		expect(deriveSessionSeed(1, 'ES', 1)).not.toBe(deriveSessionSeed(1, 'ES', 2));
	});
});

function collectSessionTicks(
	inputs: GeneratorInputs,
	sessionIndex: number,
	sessionStartPrice = inputs.startPrice
): MarketTick[] {
	const symbol = getSymbolConfig(inputs.symbol);
	const sessionStart = getSessionStart(inputs.anchorIso, inputs.sessionCount - sessionIndex - 1);
	const ticks: MarketTick[] = [];
	generateSessionTicksForStart(
		inputs,
		symbol,
		sessionIndex,
		sessionStart,
		sessionStartPrice,
		(tick) => ticks.push(tick)
	);

	return ticks;
}
