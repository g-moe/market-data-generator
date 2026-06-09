import { createHash } from 'node:crypto';

import type { SymbolConfig } from '../contracts/symbols.ts';
import type { GeneratorInputs, MarketTick } from '../contracts/types.ts';
import { getSessionEnd } from './market-time.ts';
import { roundToTick } from './price.ts';
import { createRandom, randomSigned } from './random.ts';

export function generateSessionTicksForStart(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStart: number,
	sessionStartPrice: number,
	onTick: (tick: MarketTick) => void
) {
	const sessionEnd = getSessionEnd(sessionStart);
	const random = createRandom(
		deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex)
	);
	let price = roundToTick(sessionStartPrice, symbolConfig.tickSize);

	for (let index = 0; index < inputs.ticksPerSession; index++) {
		const progress =
			inputs.ticksPerSession === 1 ? 0 : index / inputs.ticksPerSession;
		const time = Math.floor(
			sessionStart + (sessionEnd - sessionStart - 1) * progress
		);
		const volatility = getIntradayVolatility(progress);
		const move =
			randomSigned(random) *
			symbolConfig.tickSize *
			volatility *
			(random() > 0.7 ? 2 : 1);
		price = roundToTick(price + move, symbolConfig.tickSize);

		onTick({
			price,
			sessionIndex,
			side: random() > 0.5 ? 'ask' : 'bid',
			time,
			volume: nextTickVolume(random)
		});
	}

	return price;
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

function getIntradayVolatility(progress: number) {
	if (progress < 0.1) return 4;
	if (progress > 0.85) return 3;

	return 1;
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
