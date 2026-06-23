import { createHash } from 'node:crypto';

import type { SymbolConfig } from '../../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../../contracts/types.ts';
import { MILLISECONDS_PER_SECOND } from '../../shared/datetime/index.ts';
import { MARKET_SESSION_DURATION_MS } from '../shared/market-time-constants.ts';
import { roundToTick } from '../shared/price.ts';
import { TARGET_TICKS_PER_ACTIVE_SECOND } from './tick-engine-constants.ts';

const RANDOM_MULTIPLIER = 1_664_525;
const RANDOM_INCREMENT = 1_013_904_223;
const RANDOM_UNIT = 1 / 0x1_0000_0000;

type OnTickValues = (
	index: number,
	time: number,
	price: number,
	volume: number,
	side: 'ask' | 'bid'
) => void;

export type SessionTick = {
	index: number;
} & MarketTick;

export function generateSessionTicksForStart(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStart: number,
	sessionStartPrice: number,
	onTick: (tick: SessionTick) => void
) {
	return generateSessionTickValuesForStart(
		inputs,
		symbolConfig,
		sessionIndex,
		sessionStart,
		sessionStartPrice,
		(index, time, price, volume, side) => {
			onTick({
				index,
				price,
				sessionIndex,
				side,
				time,
				volume
			});
		}
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
	const ticksPerSession = inputs.ticksPerSession;
	const openVolatilityEnd = ticksPerSession * 0.1;
	const closingVolatilityStart = ticksPerSession * 0.85;
	const ticksPerActiveSecond = getTicksPerActiveSecond(ticksPerSession);
	const activeSecondCount = Math.ceil(ticksPerSession / ticksPerActiveSecond);
	const sessionSeconds = Math.max(
		1,
		Math.floor(MARKET_SESSION_DURATION_MS / MILLISECONDS_PER_SECOND)
	);
	const maxSecondOffset = sessionSeconds - 1;
	const sessionEnd = sessionStart + MARKET_SESSION_DURATION_MS - 1;

	let randomState = deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex) >>> 0;
	let priceTicks = Math.round(sessionStartPrice / symbolConfig.tickSize);

	for (let index = 0; index < ticksPerSession; index++) {
		const activeSecondIndex = Math.floor(index / ticksPerActiveSecond);
		const tickIndexInSecond = index % ticksPerActiveSecond;
		const secondOffset =
			activeSecondCount <= 1
				? 0
				: Math.floor((activeSecondIndex * maxSecondOffset) / (activeSecondCount - 1));
		const offsetWithinSecond = Math.floor(
			(tickIndexInSecond * MILLISECONDS_PER_SECOND) / ticksPerActiveSecond
		);
		const time = Math.min(
			sessionEnd,
			sessionStart + secondOffset * MILLISECONDS_PER_SECOND + offsetWithinSecond
		);
		const volatility = index < openVolatilityEnd ? 4 : index > closingVolatilityStart ? 3 : 1;

		randomState = nextRandomState(randomState);
		const signedMove = randomState * RANDOM_UNIT * 2 - 1;

		randomState = nextRandomState(randomState);
		const moveTicks = Math.round(
			signedMove * volatility * (randomState * RANDOM_UNIT > 0.7 ? 2 : 1)
		);
		priceTicks += moveTicks;

		randomState = nextRandomState(randomState);
		const side = randomState * RANDOM_UNIT > 0.5 ? 'ask' : 'bid';

		randomState = nextRandomState(randomState);
		const volumeRoll = randomState * RANDOM_UNIT;
		let volume: number;
		if (volumeRoll > 0.995) {
			randomState = nextRandomState(randomState);
			volume = 251 + Math.floor(randomState * RANDOM_UNIT * 750);
		} else if (volumeRoll > 0.95) {
			randomState = nextRandomState(randomState);
			volume = 26 + Math.floor(randomState * RANDOM_UNIT * 225);
		} else {
			randomState = nextRandomState(randomState);
			volume = 1 + Math.floor(randomState * RANDOM_UNIT * 25);
		}

		onTick(index, time, priceFromTicks(priceTicks, symbolConfig), volume, side);
	}

	return priceFromTicks(priceTicks, symbolConfig);
}

function getSessionTickTime(sessionStart: number, ticksPerSession: number, index: number) {
	const ticksPerActiveSecond = getTicksPerActiveSecond(ticksPerSession);
	const activeSecondIndex = Math.floor(index / ticksPerActiveSecond);
	const tickIndexInSecond = index % ticksPerActiveSecond;
	const activeSecondCount = Math.ceil(ticksPerSession / ticksPerActiveSecond);
	const sessionSeconds = Math.max(
		1,
		Math.floor(MARKET_SESSION_DURATION_MS / MILLISECONDS_PER_SECOND)
	);
	const maxSecondOffset = sessionSeconds - 1;
	const secondOffset =
		activeSecondCount <= 1
			? 0
			: Math.floor((activeSecondIndex * maxSecondOffset) / (activeSecondCount - 1));
	const offsetWithinSecond = Math.floor(
		(tickIndexInSecond * MILLISECONDS_PER_SECOND) / ticksPerActiveSecond
	);

	return Math.min(
		sessionStart + MARKET_SESSION_DURATION_MS - 1,
		sessionStart + secondOffset * 1000 + offsetWithinSecond
	);
}

export function countGeneratedTickTimeBuckets(ticksPerSession: number, bucketMs: number) {
	let count = 0;
	let previousBucket: number | undefined;

	for (let index = 0; index < ticksPerSession; index++) {
		const time = getSessionTickTime(0, ticksPerSession, index);
		const bucket = Math.floor(time / bucketMs) * bucketMs;

		if (bucket === previousBucket) continue;

		count++;
		previousBucket = bucket;
	}

	return count;
}

export function deriveSessionSeed(baseSeed: number, symbolId: string, sessionIndex: number) {
	const hash = createHash('sha256').update(`${baseSeed}:${symbolId}:${sessionIndex}`).digest();

	return hash.readUInt32LE(0);
}

export function getSessionOpenPrice(
	previousClose: number,
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number
) {
	if (sessionIndex === 0)
		return normalizeGeneratedPrice(
			roundToTick(previousClose, symbolConfig.tickSize),
			symbolConfig.tickDecimals
		);

	const randomState = nextRandomState(
		deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex)
	);
	const gap =
		(randomState * RANDOM_UNIT * 2 - 1) * symbolConfig.tickSize * getSessionGapTicks(sessionIndex);

	return normalizeGeneratedPrice(
		roundToTick(previousClose + gap, symbolConfig.tickSize),
		symbolConfig.tickDecimals
	);
}

export function getFirstSessionTickPrice(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStartPrice: number
) {
	let priceTicks = Math.round(sessionStartPrice / symbolConfig.tickSize);
	let randomState = deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex) >>> 0;

	randomState = nextRandomState(randomState);
	const signedMove = randomState * RANDOM_UNIT * 2 - 1;

	randomState = nextRandomState(randomState);
	const moveTicks = Math.round(signedMove * 4 * (randomState * RANDOM_UNIT > 0.7 ? 2 : 1));
	priceTicks += moveTicks;

	return priceFromTicks(priceTicks, symbolConfig);
}

function nextRandomState(state: number) {
	return (state * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
}

function getSessionGapTicks(sessionIndex: number) {
	return 1 + Math.floor(Math.log2(sessionIndex + 1));
}

function priceFromTicks(priceTicks: number, symbolConfig: SymbolConfig) {
	return normalizeGeneratedPrice(priceTicks * symbolConfig.tickSize, symbolConfig.tickDecimals);
}

function normalizeGeneratedPrice(price: number, tickDecimals: number) {
	const factor = 10 ** tickDecimals;

	return Math.round(Math.fround(price) * factor) / factor;
}

function getTicksPerActiveSecond(ticksPerSession: number) {
	const sessionSeconds = Math.max(
		1,
		Math.floor(MARKET_SESSION_DURATION_MS / MILLISECONDS_PER_SECOND)
	);

	return Math.max(TARGET_TICKS_PER_ACTIVE_SECOND, Math.ceil(ticksPerSession / sessionSeconds));
}
