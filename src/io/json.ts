import { open, mkdir, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
	MdCandle,
	MdCandleVolumeByPrice,
	StoredMdCandle,
	StoredMdCandleVolumeByPrice
} from '../contracts/types.ts';

export class CandleJsonArrayWriter<TCandle extends MdCandle> {
	private handle: FileHandle | undefined;
	private hasItems = false;

	constructor(
		private readonly filePath: string,
		private readonly serializeCandle: (candle: TCandle) => string | unknown
	) {}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		await this.handle.write('[');
	}

	async write(candles: Iterable<TCandle>) {
		const handle = this.requireHandle();
		if (Array.isArray(candles)) {
			if (candles.length === 0) return;
			const prefix = this.hasItems ? ',' : '';
			const output = `${prefix}${candles
				.map((candle) => serializeJsonValue(this.serializeCandle(candle)))
				.join(',')}`;
			this.hasItems = true;
			await handle.write(output);
			return;
		}

		let output = '';
		for (const candle of candles) {
			output += `${this.hasItems || output.length > 0 ? ',' : ''}${serializeJsonValue(
				this.serializeCandle(candle)
			)}`;
		}
		if (output.length === 0) return;
		this.hasItems = true;
		await handle.write(output);
	}

	async close() {
		if (this.handle === undefined) return;
		await this.handle.write(']\n');
		await this.handle.close();
		this.handle = undefined;
	}

	private requireHandle() {
		if (this.handle === undefined) {
			throw new Error('JSON writer is not open');
		}

		return this.handle;
	}
}

export function toStoredCandleJson(candle: MdCandle) {
	return `{"close":${candle.close},"high":${candle.high},"id":"${candle.id.toString()}","low":${candle.low},"open":${candle.open},"pos":${candle.pos},"time":${candle.time},"volume":${candle.volume},"vwap":${candle.vwap}}`;
}

export function toStoredCandle(candle: MdCandle): StoredMdCandle {
	return {
		close: candle.close,
		high: candle.high,
		id: candle.id.toString(),
		low: candle.low,
		open: candle.open,
		pos: candle.pos,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.vwap
	};
}

export function toStoredPriceLevelCandleJson(candle: MdCandleVolumeByPrice) {
	let prices = '';
	for (const [price, volume] of candle.prices.entries()) {
		prices += `${prices.length === 0 ? '' : ','}[${price},${volume}]`;
	}

	return `${toStoredCandleJson(candle).slice(0, -1)},"prices":[${prices}]}`;
}

export function toStoredPriceLevelCandle(
	candle: MdCandleVolumeByPrice
): StoredMdCandleVolumeByPrice {
	return {
		...toStoredCandle(candle),
		prices: [...candle.prices.entries()]
	};
}

function serializeJsonValue(value: string | unknown) {
	return typeof value === 'string' ? value : JSON.stringify(value);
}
