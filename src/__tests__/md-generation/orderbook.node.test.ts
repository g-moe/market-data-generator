import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	createMdOrderbook,
	OrderbookDepthStreamer,
	ORDERBOOK_LEVEL_COUNT
} from '../../md-generation/orderbook.ts';
import {
	DEPTH_END_OF_BATCH_FLAG,
	DEPTH_HEADER_SIZE,
	DEPTH_RECORD_SIZE,
	DepthCommand,
	MarketDepthWriter,
	readDepthHeader,
	readDepthRecord
} from '../../shared/file-ops/depth.ts';

const TICK = {
	price: 6000,
	side: 'ask' as const,
	time: 1_760_000_000_123,
	volume: 7
};

describe('orderbook generation', () => {
	it('creates 100 bid levels and 100 ask levels around the current tick price', () => {
		const orderbook = createMdOrderbook({
			tick: TICK,
			tickSize: 0.25
		});
		const levels = [...orderbook.values()];
		const bids = levels.filter((level) => level.side === 'BUY');
		const asks = levels.filter((level) => level.side === 'SELL');

		expect(orderbook.size).toBe(ORDERBOOK_LEVEL_COUNT * 2);
		expect(bids).toHaveLength(ORDERBOOK_LEVEL_COUNT);
		expect(asks).toHaveLength(ORDERBOOK_LEVEL_COUNT);
		expect(bids[0].price).toBe(5999.75);
		expect(bids.at(-1)?.price).toBe(5975);
		expect(asks[0].price).toBe(6000.25);
		expect(asks.at(-1)?.price).toBe(6025);
		expect(bids.every((level) => level.price < TICK.price)).toBe(true);
		expect(asks.every((level) => level.price > TICK.price)).toBe(true);
		expect(isStrictlyDescending(bids.map((level) => level.price))).toBe(true);
		expect(isStrictlyAscendingNumber(asks.map((level) => level.price))).toBe(true);
	});

	it('creates deterministic queued orders with correct level totals', () => {
		const first = createMdOrderbook({
			tick: TICK,
			tickSize: 0.25
		});
		const second = createMdOrderbook({
			tick: TICK,
			tickSize: 0.25
		});
		const orderIds = new Set<bigint>();

		expect(toComparableOrderbook(second)).toEqual(toComparableOrderbook(first));

		for (const level of first.values()) {
			const orders = [...level.orders.values()];
			const queueIds = orders.map((order) => order.queueId);
			const totalSize = orders.reduce((total, order) => total + order.size, 0);

			expect(orders.length).toBeGreaterThanOrEqual(3);
			expect(isStrictlyAscendingBigint(queueIds)).toBe(true);
			expect(level.totalSize).toBe(totalSize);

			for (const order of orders) {
				expect(order.price).toBe(level.price);
				expect(order.side).toBe(level.side);
				expect(order.time).toBe(TICK.time);
				expect(order.size).toBeGreaterThan(0);
				expect(orderIds.has(order.id)).toBe(false);
				orderIds.add(order.id);
			}
		}
	});

	it('streams an initial Sierra depth snapshot and per-tick update batches', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'market-depth-stream-'));
		const filePath = join(directory, 'tradester_ES_orderbook.depth');

		try {
			const writer = new MarketDepthWriter(filePath);
			const streamer = new OrderbookDepthStreamer(writer, 0.25);

			await writer.open();
			streamer.pushTickValues(TICK.time, TICK.price, TICK.volume, TICK.side);
			streamer.pushTickValues(TICK.time + 250, TICK.price, 3, 'bid');
			await writer.close();

			const output = await readFile(filePath);
			const header = readDepthHeader(output);
			const first = readDepthRecord(output, DEPTH_HEADER_SIZE);
			const lastSnapshotRecord = readDepthRecord(
				output,
				DEPTH_HEADER_SIZE + ORDERBOOK_LEVEL_COUNT * 2 * DEPTH_RECORD_SIZE
			);
			const firstUpdate = readDepthRecord(
				output,
				DEPTH_HEADER_SIZE + (ORDERBOOK_LEVEL_COUNT * 2 + 1) * DEPTH_RECORD_SIZE
			);
			const secondUpdate = readDepthRecord(
				output,
				DEPTH_HEADER_SIZE + (ORDERBOOK_LEVEL_COUNT * 2 + 2) * DEPTH_RECORD_SIZE
			);

			expect(header).toEqual({
				fileTypeUniqueHeaderId: 'SCDD',
				headerSize: DEPTH_HEADER_SIZE,
				recordSize: DEPTH_RECORD_SIZE,
				version: 1
			});
			expect(writer.recordCount).toBe(ORDERBOOK_LEVEL_COUNT * 2 + 3);
			expect(first).toMatchObject({
				command: DepthCommand.ClearBook,
				flags: 0,
				price: 0,
				quantity: 0,
				time: TICK.time
			});
			expect(lastSnapshotRecord.command).toBe(DepthCommand.AddAskLevel);
			expect(lastSnapshotRecord.flags).toBe(DEPTH_END_OF_BATCH_FLAG);
			expect(firstUpdate).toMatchObject({
				command: DepthCommand.ModifyAskLevel,
				flags: 0,
				price: TICK.price + 0.25,
				time: TICK.time + 250
			});
			expect(secondUpdate).toMatchObject({
				command: DepthCommand.ModifyBidLevel,
				flags: DEPTH_END_OF_BATCH_FLAG,
				price: TICK.price - 0.25,
				time: TICK.time + 250
			});
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});

function isStrictlyAscendingNumber(values: number[]) {
	for (let index = 1; index < values.length; index++) {
		if (values[index] <= values[index - 1]) return false;
	}

	return true;
}

function isStrictlyAscendingBigint(values: bigint[]) {
	for (let index = 1; index < values.length; index++) {
		if (values[index] <= values[index - 1]) return false;
	}

	return true;
}

function isStrictlyDescending(values: number[]) {
	for (let index = 1; index < values.length; index++) {
		if (values[index] >= values[index - 1]) return false;
	}

	return true;
}

function toComparableOrderbook(orderbook: ReturnType<typeof createMdOrderbook>) {
	return [...orderbook.values()].map((level) => ({
		orders: [...level.orders.values()].map((order) => ({
			id: order.id.toString(),
			price: order.price,
			queueId: order.queueId.toString(),
			side: order.side,
			size: order.size,
			time: order.time
		})),
		price: level.price,
		side: level.side,
		totalSize: level.totalSize
	}));
}
