import { getCandleStart, isTradingDayStart } from './market-time.ts';
import type { Candle, GeneratorInputs, Tick } from '../contracts/index.ts';

export function buildCandles(ticks: Tick[], inputs: GeneratorInputs): Candle[] {
	const candles: Candle[] = [];

	for (let candleIndex = 0; candleIndex < inputs.candles; candleIndex++) {
		const candleTicks = ticks.filter(
			(tick) => tick.candleIndex === candleIndex
		);
		if (candleTicks.length === 0) {
			throw new Error(`missing ticks for candle ${candleIndex}`);
		}

		const previous = candles.at(-1);
		const time = getCandleStart(inputs, candleIndex);
		const isNewTradingDay = candleIndex > 0 && isTradingDayStart(time);
		const open =
			previous && !isNewTradingDay ? previous.close : candleTicks[0].price;
		const prices = [open, ...candleTicks.map((tick) => tick.price)];
		const bidVolume = sumTickVolume(candleTicks, 'bid');
		const askVolume = sumTickVolume(candleTicks, 'ask');

		candles.push({
			time,
			open,
			high: Math.max(...prices),
			low: Math.min(...prices),
			close: candleTicks.at(-1)?.price ?? open,
			volume: bidVolume + askVolume,
			bidVolume,
			askVolume,
			isNewTradingDay
		});
	}

	return candles;
}

function sumTickVolume(ticks: Tick[], side: Tick['side']) {
	return ticks.reduce((total, tick) => {
		return tick.side === side ? total + tick.volume : total;
	}, 0);
}
