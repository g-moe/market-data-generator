import { createHash } from 'node:crypto';

import type { SymbolConfig } from '../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../contracts/types.ts';
import { getSessionEnd } from './market-time.ts';
import { roundToTick } from './price.ts';
import { createRandom, randomSigned } from './random.ts';

export type OnTickValues = (
	time: number,
	price: number,
	volume: number,
	side: 'ask' | 'bid',
	sessionIndex: number
) => void;

export function generateSessionTicksForStart(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStart: number,
	sessionStartPrice: number,
	onTick: (tick: MarketTick) => void
) {
	return generateSessionTickValuesForStart(
		inputs,
		symbolConfig,
		sessionIndex,
		sessionStart,
		sessionStartPrice,
		(time, price, volume, side, tickSessionIndex) =>
			onTick({
				price,
				sessionIndex: tickSessionIndex,
				side,
				time,
				volume
			})
	);
}

export function generateSessionTickValuesForStart(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStart: number,
	sessionStartPrice: number,
	onTick: OnTickValues
) {
	const sessionEnd = getSessionEnd(sessionStart);
	const ticksPerSession = inputs.ticksPerSession;
	const timeStep = (sessionEnd - sessionStart - 1) / ticksPerSession;
	const openVolatilityEnd = ticksPerSession * 0.1;
	const closingVolatilityStart = ticksPerSession * 0.85;
	const random = createRandom(
		deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex)
	);
	let priceTicks = Math.round(sessionStartPrice / symbolConfig.tickSize);
	const toPrice = (ticks: number) => ticks * symbolConfig.tickSize;

	for (let index = 0; index < ticksPerSession; index++) {
		const time = Math.floor(sessionStart + index * timeStep);
		const volatility =
			index < openVolatilityEnd ? 4 : index > closingVolatilityStart ? 3 : 1;
		const moveTicks = Math.round(
			randomSigned(random) * volatility * (random() > 0.7 ? 2 : 1)
		);
		priceTicks += moveTicks;

		const side = random() > 0.5 ? 'ask' : 'bid';
		onTick(
			time,
			toPrice(priceTicks),
			nextTickVolume(random),
			side,
			sessionIndex
		);
	}

	return toPrice(priceTicks);
}

export function deriveSessionSeed(
	baseSeed: number,
	symbolId: string,
	sessionIndex: number
) {
	const hash = createHash('sha256')
		.update(`${baseSeed}:${symbolId}:${sessionIndex}`)
		.digest();

	return hash.readUInt32LE(0);
}

export function getSessionOpenPrice(
	previousClose: number,
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number
) {
	if (sessionIndex === 0)
		return roundToTick(previousClose, symbolConfig.tickSize);

	const random = createRandom(
		deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex)
	);
	const gap =
		randomSigned(random) *
		symbolConfig.tickSize *
		getSessionGapTicks(sessionIndex);

	return roundToTick(previousClose + gap, symbolConfig.tickSize);
}

function getSessionGapTicks(sessionIndex: number) {
	return 1 + Math.floor(Math.log2(sessionIndex + 1));
}

function nextTickVolume(random: () => number) {
	const roll = random();
	if (roll > 0.995) return 251 + Math.floor(random() * 750);
	if (roll > 0.95) return 26 + Math.floor(random() * 225);

	return 1 + Math.floor(random() * 25);
}
