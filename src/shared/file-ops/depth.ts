import { writeSync } from 'node:fs';
import { mkdir, open, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Price, UnixMs, Volume } from '../../contracts/types.ts';
import { toUtcParts, utcDateTimeToUnixMs } from '../datetime/index.ts';

const HEADER_SIZE = 64;
const RECORD_SIZE = 24;
const DEFAULT_BUFFER_RECORDS = 16_384;
const DEPTH_EPOCH_MS = utcDateTimeToUnixMs(1899, 12, 30, 0, 0, 0);
const UINT32_SIZE = 0x1_0000_0000;
const MICROSECONDS_PER_MILLISECOND = 1000n;
const MICROSECONDS_PER_MILLISECOND_NUMBER = 1000;

export const DEPTH_HEADER_SIZE = HEADER_SIZE;
export const DEPTH_RECORD_SIZE = RECORD_SIZE;

export enum DepthCommand {
	NoCommand = 0,
	ClearBook = 1,
	AddBidLevel = 2,
	AddAskLevel = 3,
	ModifyBidLevel = 4,
	ModifyAskLevel = 5,
	DeleteBidLevel = 6,
	DeleteAskLevel = 7
}

export type DepthRecord = {
	command: DepthCommand;
	flags: number;
	numOrders: number;
	price: Price;
	quantity: Volume;
	time: UnixMs;
};

export type MarketDepthRecordWriter = {
	pushRecordValues: (
		time: UnixMs,
		command: DepthCommand,
		flags: number,
		numOrders: number,
		price: Price,
		quantity: Volume
	) => void;
};

export const DEPTH_END_OF_BATCH_FLAG = 0x01;

export class MarketDepthWriter {
	private handle: FileHandle | undefined;
	private readonly output: Buffer;
	private readonly outputView: DataView;
	private bufferedRecords = 0;
	private records = 0;

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

	get recordCount() {
		return this.records;
	}

	async open() {
		await mkdir(dirname(this.filePath), { recursive: true });
		this.handle = await open(this.filePath, 'w');
		const header = Buffer.alloc(HEADER_SIZE);
		writeHeader(header);
		await this.handle.write(header);
	}

	pushRecord(record: DepthRecord) {
		this.pushRecordValues(
			record.time,
			record.command,
			record.flags,
			record.numOrders,
			record.price,
			record.quantity
		);
	}

	pushRecordValues(
		time: UnixMs,
		command: DepthCommand,
		flags: number,
		numOrders: number,
		price: Price,
		quantity: Volume
	) {
		writeRecordValues(
			this.outputView,
			this.bufferedRecords * RECORD_SIZE,
			time,
			command,
			flags,
			numOrders,
			price,
			quantity
		);
		this.bufferedRecords++;
		this.records++;

		if (this.bufferedRecords * RECORD_SIZE === this.output.length) {
			this.writeBufferedRecordsSync();
		}
	}

	async flush() {
		await this.writeBufferedRecords();
	}

	async close() {
		await this.flush();
		await this.handle?.close();
		this.handle = undefined;
	}

	private async writeBufferedRecords() {
		if (this.bufferedRecords === 0) {
			return;
		}

		const handle = this.requireHandle();

		await handle.write(this.output, 0, this.bufferedRecords * RECORD_SIZE);
		this.bufferedRecords = 0;
	}

	private requireHandle() {
		if (this.handle === undefined) {
			throw new Error('Market depth writer is not open');
		}

		return this.handle;
	}

	private writeBufferedRecordsSync() {
		if (this.bufferedRecords === 0) {
			return;
		}

		const handle = this.requireHandle();

		writeSync(handle.fd, this.output, 0, this.bufferedRecords * RECORD_SIZE);
		this.bufferedRecords = 0;
	}
}

export class MarketDepthSessionWriter implements MarketDepthRecordWriter {
	private current: MarketDepthWriter | undefined;
	private records = 0;

	constructor(
		private readonly directoryPath: string,
		private readonly symbolId: string,
		private readonly bufferRecords = DEFAULT_BUFFER_RECORDS
	) {}

	get recordCount() {
		return this.records;
	}

	async open() {
		await mkdir(this.directoryPath, { recursive: true });
	}

	async startSession(sessionStart: UnixMs) {
		await this.current?.close();

		this.current = new MarketDepthWriter(
			getDepthSessionFilePath(this.directoryPath, this.symbolId, sessionStart),
			this.bufferRecords
		);
		await this.current.open();
	}

	pushRecordValues(
		time: UnixMs,
		command: DepthCommand,
		flags: number,
		numOrders: number,
		price: Price,
		quantity: Volume
	) {
		if (this.current === undefined) {
			throw new Error('Market depth session writer has no open session');
		}

		this.current.pushRecordValues(time, command, flags, numOrders, price, quantity);
		this.records++;
	}

	async flush() {
		await this.current?.flush();
	}

	async close() {
		await this.current?.close();
		this.current = undefined;
	}
}

function depthRecordToUnixMs(recordDateTime: bigint) {
	return Number(recordDateTime / MICROSECONDS_PER_MILLISECOND) + DEPTH_EPOCH_MS;
}

export function toDepthDateTime(time: UnixMs) {
	return BigInt(time - DEPTH_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND;
}

function getDepthSessionFilePath(directoryPath: string, symbolId: string, sessionStart: UnixMs) {
	return join(directoryPath, `${symbolId}.${toUtcParts(sessionStart).date}.depth`);
}

export function readDepthHeader(input: Buffer) {
	return {
		fileTypeUniqueHeaderId: input.toString('ascii', 0, 4),
		headerSize: input.readUInt32LE(4),
		recordSize: input.readUInt32LE(8),
		version: input.readUInt32LE(12)
	};
}

export function readDepthRecord(input: Buffer, offset: number): DepthRecord {
	const dateTime = input.readBigInt64LE(offset);

	return {
		command: input.readUInt8(offset + 8),
		flags: input.readUInt8(offset + 9),
		numOrders: input.readUInt16LE(offset + 10),
		price: input.readFloatLE(offset + 12),
		quantity: input.readUInt32LE(offset + 16),
		time: depthRecordToUnixMs(dateTime)
	};
}

function writeHeader(output: Buffer) {
	output.write('SCDD', 0, 4, 'ascii');
	output.writeUInt32LE(HEADER_SIZE, 4);
	output.writeUInt32LE(RECORD_SIZE, 8);
	output.writeUInt32LE(1, 12);
}

function writeRecordValues(
	output: DataView,
	offset: number,
	time: UnixMs,
	command: DepthCommand,
	flags: number,
	numOrders: number,
	price: Price,
	quantity: Volume
) {
	const dateTime = (time - DEPTH_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND_NUMBER;

	output.setUint32(offset, dateTime >>> 0, true);
	output.setInt32(offset + 4, Math.floor(dateTime / UINT32_SIZE), true);
	output.setUint8(offset + 8, command);
	output.setUint8(offset + 9, flags);
	output.setUint16(offset + 10, numOrders, true);
	output.setFloat32(offset + 12, price, true);
	output.setUint32(offset + 16, quantity, true);
	output.setUint32(offset + 20, 0, true);
}
