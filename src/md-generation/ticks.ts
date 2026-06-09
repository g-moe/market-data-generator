import { createHash } from 'node:crypto';

import type { SymbolConfig } from '../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../contracts/types.ts';
import { getSessionEnd } from './market-time.ts';
import { roundToTick } from './price.ts';
import { createRandom, randomSigned } from './random.ts';

export const RANDOM_MULTIPLIER = 1_664_525;
export const RANDOM_INCREMENT = 1_013_904_223;
const RANDOM_DIVISOR = 0x1_0000_0000;
export const RANDOM_UNIT = 1 / RANDOM_DIVISOR;

export type OnTickValues = (
	time: number,
	price: number,
	volume: number,
	side: 'ask' | 'bid'
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
		(time, price, volume, side) =>
			onTick({
				price,
				sessionIndex,
				side,
				time,
				volume
			})
	);
}

function generateSessionTickValuesForStart(
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
	let randomState =
		deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex) >>> 0;
	let priceTicks = Math.round(sessionStartPrice / symbolConfig.tickSize);
	const toPrice = (ticks: number) => ticks * symbolConfig.tickSize;

	for (let index = 0; index < ticksPerSession; index++) {
		const time = Math.floor(sessionStart + index * timeStep);
		const volatility =
			index < openVolatilityEnd ? 4 : index > closingVolatilityStart ? 3 : 1;
		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const signedMove = (randomState / RANDOM_DIVISOR) * 2 - 1;
		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const moveTicks = Math.round(
			signedMove * volatility * (randomState / RANDOM_DIVISOR > 0.7 ? 2 : 1)
		);
		priceTicks += moveTicks;

		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const side = randomState / RANDOM_DIVISOR > 0.5 ? 'ask' : 'bid';
		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const volumeRoll = randomState / RANDOM_DIVISOR;
		let volume: number;
		if (volumeRoll > 0.995) {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 251 + Math.floor((randomState / RANDOM_DIVISOR) * 750);
		} else if (volumeRoll > 0.95) {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 26 + Math.floor((randomState / RANDOM_DIVISOR) * 225);
		} else {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 1 + Math.floor((randomState / RANDOM_DIVISOR) * 25);
		}
		onTick(time, toPrice(priceTicks), volume, side);
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
