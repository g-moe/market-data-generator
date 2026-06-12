import { ID_SEQUENCE_MULTIPLIER } from '../../contracts/defaults.ts';
import type { MdCandle, TradeSide } from '../../contracts/types.ts';

export type MutableCandle = {
	close: number;
	high: number;
	low: number;
	open: number;
	priceVolume: number;
	time: number;
	volume: number;
	bidVolume: number;
	askVolume: number;
};

export type SequenceState = {
	lastTime: number | undefined;
	nextValue: number;
};

export function nextSequence(state: SequenceState, time: number) {
	if (state.lastTime === time) {
		const sequence = state.nextValue;
		state.nextValue++;

		return sequence;
	}

	state.lastTime = time;
	state.nextValue = 1;

	return 0;
}

export function createMutableCandleForValues(
	price: number,
	time: number,
	volume: number,
	side: TradeSide | undefined = undefined
): MutableCandle {
	const { bidVolume, askVolume } = splitSideVolume(volume, side);

	return {
		askVolume,
		bidVolume,
		close: price,
		high: price,
		low: price,
		open: price,
		priceVolume: price * volume,
		time,
		volume
	};
}

export function addTickValues(
	candle: MutableCandle,
	price: number,
	volume: number,
	side: TradeSide | undefined = undefined
) {
	const { bidVolume, askVolume } = splitSideVolume(volume, side);

	candle.close = price;
	candle.high = Math.max(candle.high, price);
	candle.low = Math.min(candle.low, price);
	candle.priceVolume += price * volume;
	candle.volume += volume;
	candle.bidVolume += bidVolume;
	candle.askVolume += askVolume;
}

export function finalizeMutableCandle(candle: MutableCandle, pos: number): MdCandle {
	return finalizeMutableCandleWithId(candle, pos, createBarId(candle.time, 0));
}

export function finalizeMutableCandleWithId(
	candle: MutableCandle,
	pos: number,
	id: bigint
): MdCandle {
	return {
		askVolume: candle.askVolume,
		bidVolume: candle.bidVolume,
		close: candle.close,
		high: candle.high,
		id,
		low: candle.low,
		open: candle.open,
		pos,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.priceVolume / candle.volume
	};
}

export function createBarId(time: number, sequence: number) {
	return BigInt(time) * ID_SEQUENCE_MULTIPLIER + BigInt(sequence);
}

function splitSideVolume(volume: number, side: TradeSide | undefined) {
	return {
		askVolume: side === 'ask' ? volume : 0,
		bidVolume: side === 'bid' ? volume : 0
	};
}
