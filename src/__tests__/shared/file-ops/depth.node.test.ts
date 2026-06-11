import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	DEPTH_END_OF_BATCH_FLAG,
	DEPTH_HEADER_SIZE,
	DEPTH_RECORD_SIZE,
	DepthCommand,
	MarketDepthWriter,
	readDepthHeader,
	readDepthRecord,
	toDepthDateTime
} from '../../../shared/file-ops/depth.ts';
import { parseIsoToUnixMs } from '../../../shared/datetime/index.ts';

describe('market depth output', () => {
	it('writes Sierra Chart depth headers and 24-byte records', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-depth-'));
		const filePath = join(directory, 'tradester_ES_orderbook.depth');
		const time = parseIsoToUnixMs('2026-06-08T22:00:00.000Z');

		try {
			const writer = new MarketDepthWriter(filePath);
			await writer.open();
			writer.pushRecord({
				command: DepthCommand.ClearBook,
				flags: 0,
				numOrders: 0,
				price: 0,
				quantity: 0,
				time
			});
			writer.pushRecord({
				command: DepthCommand.AddBidLevel,
				flags: DEPTH_END_OF_BATCH_FLAG,
				numOrders: 4,
				price: 5999.75,
				quantity: 17,
				time
			});
			await writer.close();

			const output = await readFile(filePath);
			const header = readDepthHeader(output);
			const clear = readDepthRecord(output, DEPTH_HEADER_SIZE);
			const bid = readDepthRecord(output, DEPTH_HEADER_SIZE + DEPTH_RECORD_SIZE);

			expect(output).toHaveLength(DEPTH_HEADER_SIZE + DEPTH_RECORD_SIZE * 2);
			expect(header).toEqual({
				fileTypeUniqueHeaderId: 'SCDD',
				headerSize: DEPTH_HEADER_SIZE,
				recordSize: DEPTH_RECORD_SIZE,
				version: 1
			});
			expect(output.readBigInt64LE(DEPTH_HEADER_SIZE)).toBe(toDepthDateTime(time));
			expect(clear).toMatchObject({
				command: DepthCommand.ClearBook,
				flags: 0,
				numOrders: 0,
				price: 0,
				quantity: 0,
				time
			});
			expect(bid).toMatchObject({
				command: DepthCommand.AddBidLevel,
				flags: DEPTH_END_OF_BATCH_FLAG,
				numOrders: 4,
				price: 5999.75,
				quantity: 17,
				time
			});
			expect(writer.recordCount).toBe(2);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it('flushes without records and rejects writes after close flushes pending records', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-data-depth-empty-'));
		const filePath = join(directory, 'tradester_ES_orderbook.depth');

		try {
			const writer = new MarketDepthWriter(filePath);
			await writer.open();
			await writer.flush();
			await writer.close();

			const output = await readFile(filePath);
			expect(output).toHaveLength(DEPTH_HEADER_SIZE);
			expect(() =>
				writer.pushRecord({
					command: DepthCommand.ClearBook,
					flags: 0,
					numOrders: 0,
					price: 0,
					quantity: 0,
					time: 0
				})
			).not.toThrow();
			await expect(writer.flush()).rejects.toThrow('Market depth writer is not open');
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});
