import { writeSync } from 'node:fs';
import { open, mkdir, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { MarketTick, ScidRecord } from '../contracts/types.ts';

const HEADER_SIZE = 56;
const RECORD_SIZE = 40;
const DEFAULT_BUFFER_RECORDS = 16_384;
const SCID_EPOCH_MS = Date.UTC(1899, 11, 30);
const MICROSECONDS_PER_MILLISECOND = 1000n;

export class ScidTickWriter {
	private handle: FileHandle | undefined;
	private readonly output: Buffer;
	private recordCount = 0;

	constructor(
		private readonly filePath: string,
		bufferRecords = DEFAULT_BUFFER_RECORDS
	) {
		this.output = Buffer.alloc(bufferRecords * RECORD_SIZE);
	}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		const header = Buffer.alloc(HEADER_SIZE);
		writeHeader(header);
		await this.handle.write(header);
	}

	private async writeBufferedTicks() {
		if (this.recordCount === 0) return;
		const handle = this.requireHandle();
		await handle.write(this.output, 0, this.recordCount * RECORD_SIZE);
		this.recordCount = 0;
	}

	pushTick(tick: MarketTick) {
		writeTick(this.output, this.recordCount * RECORD_SIZE, tick);
		this.recordCount++;
		if (this.recordCount * RECORD_SIZE === this.output.length) {
			this.writeBufferedTicksSync();
		}
	}

	async flush() {
		await this.writeBufferedTicks();
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

	private writeBufferedTicksSync() {
		if (this.recordCount === 0) return;
		const handle = this.requireHandle();
		writeSync(handle.fd, this.output, 0, this.recordCount * RECORD_SIZE);
		this.recordCount = 0;
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

function writeTick(output: Buffer, offset: number, tick: MarketTick) {
	output.writeBigInt64LE(toScDateTimeMsValue(tick.time), offset);
	output.writeFloatLE(tick.price, offset + 8);
	output.writeFloatLE(tick.price, offset + 12);
	output.writeFloatLE(tick.price, offset + 16);
	output.writeFloatLE(tick.price, offset + 20);
	output.writeUInt32LE(1, offset + 24);
	output.writeUInt32LE(tick.volume, offset + 28);
	output.writeUInt32LE(tick.side === 'bid' ? tick.volume : 0, offset + 32);
	output.writeUInt32LE(tick.side === 'ask' ? tick.volume : 0, offset + 36);
}

export function toScDateTimeMs(date: Date) {
	return toScDateTimeMsValue(date.getTime());
}

function toScDateTimeMsValue(time: number) {
	return BigInt(time - SCID_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND;
}
