import {
	getCandleDurationMs,
	getCandleStart,
	getTimeWeight,
	isTradingDayStart
} from './market-time.ts';
import { roundToTick } from './price.ts';
import { createRandom, randomSigned } from './random.ts';
import type { GeneratorInputs, Tick } from '../contracts/types.ts';

export function buildTicks(inputs: GeneratorInputs): Tick[] {
	const random = createRandom(inputs.seed);
	const ticks: Tick[] = [];
	let previousClose = roundToTick(inputs.startPrice, inputs.minTickSize);

	for (let candleIndex = 0; candleIndex < inputs.candles; candleIndex++) {
		const candleStart = getCandleStart(inputs, candleIndex);
		const isNewTradingDay = candleIndex > 0 && isTradingDayStart(candleStart);
		const open = isNewTradingDay
			? roundToTick(
					previousClose + randomSigned(random) * inputs.minTickSize * 20,
					inputs.minTickSize
				)
			: previousClose;
		const volumeMultiplier = getTimeWeight(candleStart, 'volume');
		const volatilityMultiplier = getTimeWeight(candleStart, 'volatility');
		let price = open;

		for (let index = 0; index < inputs.ticksPerCandle; index++) {
			const offsetMs = Math.floor(
				(getCandleDurationMs(inputs) / inputs.ticksPerCandle) * index
			);
			const move =
				randomSigned(random) *
				inputs.minTickSize *
				volatilityMultiplier *
				(0.5 + random());
			price = roundToTick(price + move, inputs.minTickSize);

			const volume = Math.max(
				1,
				Math.round((1 + random() * 9) * volumeMultiplier)
			);
			ticks.push({
				candleIndex,
				price,
				side: random() > 0.5 ? 'ask' : 'bid',
				time: new Date(candleStart.getTime() + offsetMs),
				volume
			});
		}

		previousClose = price;
	}

	return ticks;
}
