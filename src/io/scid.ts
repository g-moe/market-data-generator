import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Candle } from '../contracts/types.ts';

const HEADER_SIZE = 56;
const RECORD_SIZE = 40;
const SCID_EPOCH_MS = Date.UTC(1899, 11, 30);
const MICROSECONDS_PER_MILLISECOND = 1000n;

export function serializeCandlesToScid(candles: Candle[]) {
	const output = Buffer.alloc(HEADER_SIZE + candles.length * RECORD_SIZE);

	writeHeader(output);
	candles.forEach((candle, index) => {
		writeRecord(output, HEADER_SIZE + index * RECORD_SIZE, candle);
	});

	return output;
}

export async function writeCandlesScid(filePath: string, candles: Candle[]) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, serializeCandlesToScid(candles));
}

function writeHeader(output: Buffer) {
	output.write('SCID', 0, 4, 'ascii');
	output.writeUInt32LE(HEADER_SIZE, 4);
	output.writeUInt32LE(RECORD_SIZE, 8);
	output.writeUInt16LE(1, 12);
	output.writeUInt16LE(0, 14);
	output.writeUInt32LE(0, 16);
}

function writeRecord(output: Buffer, offset: number, candle: Candle) {
	output.writeBigInt64LE(toScDateTimeMs(candle.time), offset);
	output.writeFloatLE(candle.open, offset + 8);
	output.writeFloatLE(candle.high, offset + 12);
	output.writeFloatLE(candle.low, offset + 16);
	output.writeFloatLE(candle.close, offset + 20);
	output.writeUInt32LE(candle.transactions, offset + 24);
	output.writeUInt32LE(candle.volume, offset + 28);
	output.writeUInt32LE(candle.bidVolume, offset + 32);
	output.writeUInt32LE(candle.askVolume, offset + 36);
}

export function toScDateTimeMs(date: Date) {
	return BigInt(date.getTime() - SCID_EPOCH_MS) * MICROSECONDS_PER_MILLISECOND;
}
