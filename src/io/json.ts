import { open, mkdir, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
	MdCandle,
	MdCandleVolumeByPrice,
	StoredMdCandle,
	StoredMdCandleVolumeByPrice
} from '../contracts/types.ts';

export const CANDLE_ROW_HEADER = 'id,time,pos,open,high,low,close,volume,vwap';

export const PRICE_LEVEL_CANDLE_ROW_HEADER = `${CANDLE_ROW_HEADER},prices`;

export class CandleJsonArrayWriter<TCandle extends MdCandle> {
	private handle: FileHandle | undefined;
	private hasItems = false;
	private readonly iterableChunkSize = 512;
	private readonly outputChunk: string[] = [];

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
		const output = this.outputChunk;
		output.length = 0;
		for (const candle of candles) {
			output.push(
				`${this.hasItems || output.length > 0 ? ',' : ''}${serializeJsonValue(
					this.serializeCandle(candle)
				)}`
			);
			if (output.length === this.iterableChunkSize) {
				await handle.write(output.join(''));
				this.hasItems = true;
				output.length = 0;
			}
		}
		if (output.length === 0) return;
		this.hasItems = true;
		await handle.write(output.join(''));
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

export class CandleRowWriter<TCandle extends MdCandle> {
	private handle: FileHandle | undefined;
	private readonly iterableChunkSize = 512;
	private readonly outputChunk: string[] = [];

	constructor(
		private readonly filePath: string,
		private readonly header: string,
		private readonly serializeCandle: (candle: TCandle) => string
	) {}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		await this.handle.write(`${this.header}\n`);
	}

	async write(candles: Iterable<TCandle>) {
		const handle = this.requireHandle();
		const output = this.outputChunk;
		output.length = 0;
		for (const candle of candles) {
			output.push(`${this.serializeCandle(candle)}\n`);
			if (output.length === this.iterableChunkSize) {
				await handle.write(output.join(''));
				output.length = 0;
			}
		}
		if (output.length === 0) return;
		await handle.write(output.join(''));
	}

	async close() {
		if (this.handle === undefined) return;
		await this.handle.close();
		this.handle = undefined;
	}

	private requireHandle() {
		if (this.handle === undefined) {
			throw new Error('candle row writer is not open');
		}

		return this.handle;
	}
}

export function toStoredCandleRow(candle: MdCandle) {
	return `${candle.id.toString()},${candle.time},${candle.pos},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume},${candle.vwap}`;
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

export function toStoredPriceLevelCandleRow(candle: MdCandleVolumeByPrice) {
	let prices = '';
	for (const [price, volume] of candle.prices.entries()) {
		prices += `${prices.length === 0 ? '' : ';'}${price}:${volume}`;
	}

	return `${toStoredCandleRow(candle)},${prices}`;
}

export function toStoredPriceLevelCandle(
	candle: MdCandleVolumeByPrice
): StoredMdCandleVolumeByPrice {
	return {
		...toStoredCandle(candle),
		prices: [...candle.prices.entries()]
	};
}

export function parseCandleRowsFast(text: string): StoredMdCandle[] {
	const lines = text.trimEnd().split('\n');
	if (lines.length <= 1) return [];

	if (lines[0] !== CANDLE_ROW_HEADER) {
		throw new Error('Unexpected candle row header');
	}

	const candles: StoredMdCandle[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.length === 0) continue;

		let start = 0;
		let field = 0;
		let id = '';
		let time = 0;
		let pos = 0;
		let open = 0;
		let high = 0;
		let low = 0;
		let close = 0;
		let volume = 0;
		let vwap = 0;

		for (let j = 0; j <= line.length; j++) {
			if (j !== line.length && line.charCodeAt(j) !== 44) continue;

			const value = line.slice(start, j);
			switch (field) {
				case 0:
					id = value;
					break;
				case 1:
					time = Number(value);
					break;
				case 2:
					pos = Number(value);
					break;
				case 3:
					open = Number(value);
					break;
				case 4:
					high = Number(value);
					break;
				case 5:
					low = Number(value);
					break;
				case 6:
					close = Number(value);
					break;
				case 7:
					volume = Number(value);
					break;
				case 8:
					vwap = Number(value);
					break;
				default:
					throw new Error(`Unexpected extra candle row field on line ${i + 1}`);
			}

			field++;
			start = j + 1;
		}

		if (field !== 9) {
			throw new Error(`Expected 9 candle row fields on line ${i + 1}`);
		}

		candles.push({
			close,
			high,
			id,
			low,
			open,
			pos,
			time,
			volume,
			vwap
		});
	}

	return candles;
}

function serializeJsonValue(value: string | unknown) {
	return typeof value === 'string' ? value : JSON.stringify(value);
}
