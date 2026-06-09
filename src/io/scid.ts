import { open, mkdir, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { MarketTick, ScidRecord } from '../contracts/types.ts';

const HEADER_SIZE = 56;
const RECORD_SIZE = 40;
const SCID_EPOCH_MS = Date.UTC(1899, 11, 30);
const MICROSECONDS_PER_MILLISECOND = 1000n;

export class ScidTickWriter {
	private handle: FileHandle | undefined;
	private readonly ticks: MarketTick[] = [];

	constructor(private readonly filePath: string) {}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		const header = Buffer.alloc(HEADER_SIZE);
		writeHeader(header);
		await this.handle.write(header);
	}

	async writeTicks(ticks: MarketTick[]) {
		if (ticks.length === 0) return;
		const handle = this.requireHandle();
		const output = Buffer.alloc(ticks.length * RECORD_SIZE);
		ticks.forEach((tick, index) => {
			writeRecord(output, index * RECORD_SIZE, tickToScidRecord(tick));
		});
		await handle.write(output);
	}

	pushTick(tick: MarketTick) {
		this.ticks.push(tick);
	}

	async flush() {
		if (this.ticks.length === 0) return;
		const ticks = this.ticks.splice(0);
		await this.writeTicks(ticks);
	}

	async close() {
		await this.flush();
		await this.handle?.close();
		this.handle = undefined;
	}

	private requireHandle() {
		if (this.handle === undefined) {
			throw new Error('SCID writer is not open');
		}

		return this.handle;
	}
}

export function tickToScidRecord(tick: MarketTick): ScidRecord {
	return {
		askVolume: tick.side === 'ask' ? tick.volume : 0,
		bidVolume: tick.side === 'bid' ? tick.volume : 0,
		close: tick.price,
		high: tick.price,
		low: tick.price,
		open: tick.price,
		time: new Date(tick.time),
		transactions: 1,
		volume: tick.volume
	};
}

function writeHeader(output: Buffer) {
	output.write('SCID', 0, 4, 'ascii');
	output.writeUInt32LE(HEADER_SIZE, 4);
	output.writeUInt32LE(RECORD_SIZE, 8);
	output.writeUInt16LE(1, 12);
	output.writeUInt16LE(0, 14);
	output.writeUInt32LE(0, 16);
}

function writeRecord(output: Buffer, offset: number, record: ScidRecord) {
	output.writeBigInt64LE(toScDateTimeMs(record.time), offset);
	output.writeFloatLE(record.open, offset + 8);
	output.writeFloatLE(record.high, offset + 12);
	output.writeFloatLE(record.low, offset + 16);
	output.writeFloatLE(record.close, offset + 20);
	output.writeUInt32LE(record.transactions, offset + 24);
	output.writeUInt32LE(record.volume, offset + 28);
	output.writeUInt32LE(record.bidVolume, offset + 32);
	output.writeUInt32LE(record.askVolume, offset + 36);
}

export function toScDateTimeMs(date: Date) {
	return BigInt(date.getTime() - SCID_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND;
}
