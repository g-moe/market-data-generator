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
		private readonly serializeCandle: (candle: TCandle) => unknown
	) {}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		await this.handle.write('[');
	}

	async write(candles: TCandle[]) {
		if (candles.length === 0) return;
		const handle = this.requireHandle();
		const prefix = this.hasItems ? ',' : '';
		const output = `${prefix}${candles
			.map((candle) => JSON.stringify(this.serializeCandle(candle)))
			.join(',')}`;
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

export function toStoredPriceLevelCandle(
	candle: MdCandleVolumeByPrice
): StoredMdCandleVolumeByPrice {
	return {
		...toStoredCandle(candle),
		prices: [...candle.prices.entries()]
	};
}
