import { writeSync } from 'node:fs';
import { open, mkdir, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
	MarketTick,
	ScidRecord,
	TradeSide
} from '../../contracts/types.ts';
import { utcDateTimeToUnixMs } from '../../shared/datetime/index.ts';

const HEADER_SIZE = 56;
const RECORD_SIZE = 40;
const DEFAULT_BUFFER_RECORDS = 16_384;
const SCID_EPOCH_MS = utcDateTimeToUnixMs(1899, 12, 30, 0, 0, 0);
const UINT32_SIZE = 0x1_0000_0000;
const MICROSECONDS_PER_MILLISECOND = 1000n;
export const SCID_EPOCH_OFFSET_MS = SCID_EPOCH_MS;

export class ScidTickWriter {
	private handle: FileHandle | undefined;
	private readonly output: Buffer;
	private readonly outputView: DataView;
	private recordCount = 0;

	constructor(
		private readonly filePath: string,
		bufferRecords = DEFAULT_BUFFER_RECORDS
	) {
		this.output = Buffer.alloc(bufferRecords * RECORD_SIZE);
		this.outputView = new DataView(
			this.output.buffer,
			this.output.byteOffset,
			this.output.byteLength
		);
	}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		const header = Buffer.alloc(HEADER_SIZE);
		writeHeader(header);
		await this.handle.write(header);
	}

	private async writeBufferedTicks() {
		if (this.recordCount === 0) {
			return;
		}

		const handle = this.requireHandle();

		await handle.write(this.output, 0, this.recordCount * RECORD_SIZE);
		this.recordCount = 0;
	}

	pushTick(tick: MarketTick) {
		this.pushTickValues(tick.time, tick.price, tick.volume, tick.side);
	}

	pushTickValues(time: number, price: number, volume: number, side: TradeSide) {
		this.pushScDateTimeMsValue(
			(time - SCID_EPOCH_MS) * 1000,
			price,
			volume,
			side
		);
	}

	pushScDateTimeMsValue(
		scDateTimeMs: number,
		price: number,
		volume: number,
		side: TradeSide
	) {
		this.pushScDateTimeMsVolumeValues(
			scDateTimeMs,
			price,
			volume,
			side === 'bid' ? volume : 0,
			side === 'ask' ? volume : 0
		);
	}

	pushScDateTimeMsVolumeValues(
		scDateTimeMs: number,
		price: number,
		volume: number,
		bidVolume: number,
		askVolume: number
	) {
		writeTickValues(
			this.outputView,
			this.recordCount * RECORD_SIZE,
			scDateTimeMs,
			price,
			volume,
			bidVolume,
			askVolume
		);
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
		if (this.recordCount === 0) {
			return;
		}

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
		time: tick.time,
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

function writeTickValues(
	output: DataView,
	offset: number,
	scDateTimeMs: number,
	price: number,
	volume: number,
	bidVolume: number,
	askVolume: number
) {
	output.setUint32(offset, scDateTimeMs >>> 0, true);
	output.setInt32(offset + 4, Math.floor(scDateTimeMs / UINT32_SIZE), true);
	output.setFloat32(offset + 8, price, true);
	output.setFloat32(offset + 12, price, true);
	output.setFloat32(offset + 16, price, true);
	output.setFloat32(offset + 20, price, true);
	output.setUint32(offset + 24, 1, true);
	output.setUint32(offset + 28, volume, true);
	output.setUint32(offset + 32, bidVolume, true);
	output.setUint32(offset + 36, askVolume, true);
}

export function toScDateTimeMs(time: number) {
	return BigInt(time - SCID_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND;
}
