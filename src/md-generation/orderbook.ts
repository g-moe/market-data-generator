import type {
	MdOrder,
	MdOrderbook,
	MdOrderbookLevel,
	Price,
	TradeSide,
	UnixMs,
	Volume
} from '../contracts/types.ts';
import {
	DEPTH_END_OF_BATCH_FLAG,
	DepthCommand,
	type DepthRecord,
	MarketDepthWriter
} from '../shared/file-ops/depth.ts';
import { roundToTick } from './price.ts';

export const ORDERBOOK_LEVEL_COUNT = 100;

const ASK_ORDER_ID_OFFSET = 500_000n;
const ORDER_ID_TIME_MULTIPLIER = 1_000_000n;
const QUEUE_ID_LEVEL_MULTIPLIER = 1_000n;
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

type DepthSide = 'BUY' | 'SELL';

type OrderbookTick = {
	price: Price;
	side: TradeSide;
	time: UnixMs;
	volume: Volume;
};

type CreateOrderbookOptions = {
	levelCount?: number;
	tickSize: number;
	tick: OrderbookTick;
};

type DepthLevel = {
	numOrders: number;
	price: Price;
	priceTicks: number;
	quantity: Volume;
	side: DepthSide;
};

type ConfluenceKey = {
	priceTicks: number;
	side: DepthSide;
};

export class OrderbookDepthStreamer {
	private pendingBatchRecord: DepthRecord | undefined;
	private previousAnchorPriceTicks: number | undefined;
	private previousConfluenceKey: ConfluenceKey | undefined;
	private lastSnapshotTime: UnixMs | undefined;

	constructor(
		private readonly writer: MarketDepthWriter,
		private readonly tickSize: number,
		private readonly levelCount = ORDERBOOK_LEVEL_COUNT
	) {}

	pushTickValues(time: UnixMs, price: Price, volume: Volume, side: TradeSide) {
		const tick = {
			price,
			side,
			time,
			volume
		};
		const anchorPriceTicks = Math.round(price / this.tickSize);

		if (this.shouldWriteFullSnapshot(time)) {
			this.writeFullSnapshot(tick, anchorPriceTicks);
			this.previousAnchorPriceTicks = anchorPriceTicks;
			this.previousConfluenceKey = createConfluenceKey(anchorPriceTicks, side);
			this.lastSnapshotTime = time;

			return;
		}

		this.writeIncrementalUpdate(tick, anchorPriceTicks);
		this.previousAnchorPriceTicks = anchorPriceTicks;
		this.previousConfluenceKey = createConfluenceKey(anchorPriceTicks, side);
	}

	private shouldWriteFullSnapshot(time: UnixMs) {
		if (this.previousAnchorPriceTicks === undefined || this.lastSnapshotTime === undefined) {
			return true;
		}

		return time - this.lastSnapshotTime >= SNAPSHOT_INTERVAL_MS;
	}

	private writeFullSnapshot(tick: OrderbookTick, anchorPriceTicks: number) {
		this.pushBatchRecord({
			command: DepthCommand.ClearBook,
			flags: 0,
			numOrders: 0,
			price: 0,
			quantity: 0,
			time: tick.time
		});

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			this.pushLevelRecord(
				DepthCommand.AddBidLevel,
				tick.time,
				createDepthLevel({
					anchorPriceTicks,
					levelIndex,
					side: 'BUY',
					tick,
					tickSize: this.tickSize
				})
			);
		}

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			this.pushLevelRecord(
				DepthCommand.AddAskLevel,
				tick.time,
				createDepthLevel({
					anchorPriceTicks,
					levelIndex,
					side: 'SELL',
					tick,
					tickSize: this.tickSize
				})
			);
		}

		this.finishBatch();
	}

	private writeIncrementalUpdate(tick: OrderbookTick, anchorPriceTicks: number) {
		const previousAnchorPriceTicks = this.previousAnchorPriceTicks;
		if (previousAnchorPriceTicks === undefined) {
			this.writeFullSnapshot(tick, anchorPriceTicks);

			return;
		}

		this.writeRangeChanges(tick.time, previousAnchorPriceTicks, anchorPriceTicks, 'BUY');
		this.writeRangeChanges(tick.time, previousAnchorPriceTicks, anchorPriceTicks, 'SELL');
		const currentConfluenceKey = createConfluenceKey(anchorPriceTicks, tick.side);
		this.writeConfluenceRestore(tick.time, anchorPriceTicks, currentConfluenceKey);
		this.writeCurrentConfluence(tick, anchorPriceTicks, currentConfluenceKey);
		this.finishBatch();
	}

	private writeRangeChanges(
		time: UnixMs,
		previousAnchorPriceTicks: number,
		anchorPriceTicks: number,
		side: DepthSide
	) {
		if (previousAnchorPriceTicks === anchorPriceTicks) {
			return;
		}

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			const priceTicks = getLevelPriceTicks(previousAnchorPriceTicks, side, levelIndex);
			if (isPriceTickInRange(priceTicks, anchorPriceTicks, side, this.levelCount)) continue;

			this.pushLevelRecord(
				getDeleteCommand(side),
				time,
				createBaseDepthLevel(priceTicks, side, this.tickSize)
			);
		}

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			const priceTicks = getLevelPriceTicks(anchorPriceTicks, side, levelIndex);
			if (isPriceTickInRange(priceTicks, previousAnchorPriceTicks, side, this.levelCount)) continue;

			this.pushLevelRecord(
				getAddCommand(side),
				time,
				createBaseDepthLevel(priceTicks, side, this.tickSize)
			);
		}
	}

	private writeConfluenceRestore(
		time: UnixMs,
		anchorPriceTicks: number,
		currentConfluenceKey: ConfluenceKey
	) {
		const previous = this.previousConfluenceKey;
		if (previous === undefined) return;
		if (!isPriceTickInRange(previous.priceTicks, anchorPriceTicks, previous.side, this.levelCount))
			return;
		if (isSameConfluenceKey(previous, currentConfluenceKey)) return;

		this.pushLevelRecord(
			getModifyCommand(previous.side),
			time,
			createBaseDepthLevel(previous.priceTicks, previous.side, this.tickSize)
		);
	}

	private writeCurrentConfluence(
		tick: OrderbookTick,
		anchorPriceTicks: number,
		current: ConfluenceKey
	) {
		this.pushLevelRecord(
			getModifyCommand(current.side),
			tick.time,
			createDepthLevel({
				anchorPriceTicks,
				levelIndex: 0,
				side: current.side,
				tick,
				tickSize: this.tickSize
			})
		);
	}

	private pushLevelRecord(command: DepthCommand, time: UnixMs, level: DepthLevel) {
		this.pushBatchRecord({
			command,
			flags: 0,
			numOrders:
				command === DepthCommand.DeleteBidLevel || command === DepthCommand.DeleteAskLevel
					? 0
					: level.numOrders,
			price: level.price,
			quantity:
				command === DepthCommand.DeleteBidLevel || command === DepthCommand.DeleteAskLevel
					? 0
					: level.quantity,
			time
		});
	}

	private pushBatchRecord(record: DepthRecord) {
		if (this.pendingBatchRecord !== undefined) {
			this.writer.pushRecord(this.pendingBatchRecord);
		}

		this.pendingBatchRecord = record;
	}

	private finishBatch() {
		if (this.pendingBatchRecord === undefined) {
			return;
		}

		this.writer.pushRecord({
			...this.pendingBatchRecord,
			flags: this.pendingBatchRecord.flags | DEPTH_END_OF_BATCH_FLAG
		});
		this.pendingBatchRecord = undefined;
	}
}

export function createMdOrderbook({
	levelCount = ORDERBOOK_LEVEL_COUNT,
	tick,
	tickSize
}: CreateOrderbookOptions): MdOrderbook {
	const orderbook: MdOrderbook = new Map();
	const anchorPriceTicks = Math.round(tick.price / tickSize);

	for (let levelIndex = 0; levelIndex < levelCount; levelIndex++) {
		const level = createDepthLevel({
			anchorPriceTicks,
			levelIndex,
			side: 'BUY',
			tick,
			tickSize
		});

		orderbook.set(level.price, createOrderbookLevel(level, levelIndex, tick));
	}

	for (let levelIndex = 0; levelIndex < levelCount; levelIndex++) {
		const level = createDepthLevel({
			anchorPriceTicks,
			levelIndex,
			side: 'SELL',
			tick,
			tickSize
		});

		orderbook.set(level.price, createOrderbookLevel(level, levelIndex, tick));
	}

	return orderbook;
}

function createOrderbookLevel(
	level: DepthLevel,
	levelIndex: number,
	tick: OrderbookTick
): MdOrderbookLevel {
	const orders = new Map<MdOrder['id'], MdOrder>();
	let remainingSize = level.quantity;

	for (let orderIndex = 0; orderIndex < level.numOrders; orderIndex++) {
		const remainingOrders = level.numOrders - orderIndex;
		const size =
			orderIndex === level.numOrders - 1
				? remainingSize
				: Math.ceil(remainingSize / remainingOrders);
		const order = createOrder({
			levelIndex,
			orderIndex,
			price: level.price,
			side: level.side,
			size,
			tick
		});

		orders.set(order.id, order);
		remainingSize -= size;
	}

	return {
		orders,
		price: level.price,
		side: level.side,
		totalSize: level.quantity
	};
}

function createOrder({
	levelIndex,
	orderIndex,
	price,
	side,
	size,
	tick
}: {
	levelIndex: number;
	orderIndex: number;
	price: Price;
	side: DepthSide;
	size: Volume;
	tick: OrderbookTick;
}): MdOrder {
	return {
		id: createOrderId(tick.time, side, levelIndex, orderIndex),
		price,
		queueId: createQueueId(levelIndex, orderIndex),
		side,
		size,
		time: tick.time
	};
}

function createDepthLevel({
	anchorPriceTicks,
	levelIndex,
	side,
	tick,
	tickSize
}: {
	anchorPriceTicks: number;
	levelIndex: number;
	side: DepthSide;
	tick: OrderbookTick;
	tickSize: number;
}): DepthLevel {
	const priceTicks = getLevelPriceTicks(anchorPriceTicks, side, levelIndex);
	const base = createBaseDepthLevel(priceTicks, side, tickSize);
	const confluence = createConfluenceKey(anchorPriceTicks, tick.side);

	if (confluence.side !== side || confluence.priceTicks !== priceTicks) {
		return base;
	}

	return {
		...base,
		numOrders: base.numOrders + Math.min(4, Math.max(1, Math.ceil(tick.volume / 25))),
		quantity: base.quantity + tick.volume
	};
}

function createBaseDepthLevel(priceTicks: number, side: DepthSide, tickSize: number): DepthLevel {
	const numOrders = 3 + (hashLevelInput(priceTicks, side, 0) % 18);
	const quantity = numOrders + 5 + (hashLevelInput(priceTicks, side, 1) % 80);

	return {
		numOrders,
		price: roundToTick(priceTicks * tickSize, tickSize),
		priceTicks,
		quantity,
		side
	};
}

function createConfluenceKey(anchorPriceTicks: number, tradeSide: TradeSide): ConfluenceKey {
	if (tradeSide === 'ask') {
		return {
			priceTicks: anchorPriceTicks + 1,
			side: 'SELL'
		};
	}

	return {
		priceTicks: anchorPriceTicks - 1,
		side: 'BUY'
	};
}

function isSameConfluenceKey(left: ConfluenceKey, right: ConfluenceKey) {
	return left.priceTicks === right.priceTicks && left.side === right.side;
}

function getLevelPriceTicks(anchorPriceTicks: number, side: DepthSide, levelIndex: number) {
	if (side === 'BUY') return anchorPriceTicks - levelIndex - 1;

	return anchorPriceTicks + levelIndex + 1;
}

function isPriceTickInRange(
	priceTicks: number,
	anchorPriceTicks: number,
	side: DepthSide,
	levelCount: number
) {
	if (side === 'BUY') {
		return priceTicks >= anchorPriceTicks - levelCount && priceTicks <= anchorPriceTicks - 1;
	}

	return priceTicks >= anchorPriceTicks + 1 && priceTicks <= anchorPriceTicks + levelCount;
}

function getAddCommand(side: DepthSide) {
	return side === 'BUY' ? DepthCommand.AddBidLevel : DepthCommand.AddAskLevel;
}

function getModifyCommand(side: DepthSide) {
	return side === 'BUY' ? DepthCommand.ModifyBidLevel : DepthCommand.ModifyAskLevel;
}

function getDeleteCommand(side: DepthSide) {
	return side === 'BUY' ? DepthCommand.DeleteBidLevel : DepthCommand.DeleteAskLevel;
}

function createOrderId(time: UnixMs, side: DepthSide, levelIndex: number, orderIndex: number) {
	const sideOffset = side === 'SELL' ? ASK_ORDER_ID_OFFSET : 0n;

	return (
		BigInt(time) * ORDER_ID_TIME_MULTIPLIER +
		sideOffset +
		BigInt(levelIndex) * 100n +
		BigInt(orderIndex + 1)
	);
}

function createQueueId(levelIndex: number, orderIndex: number) {
	return BigInt(levelIndex + 1) * QUEUE_ID_LEVEL_MULTIPLIER + BigInt(orderIndex + 1);
}

function hashLevelInput(priceTicks: number, side: DepthSide, salt: number) {
	const sideValue = side === 'BUY' ? 17 : 31;
	let value = Math.imul(priceTicks, 2_654_435_761);

	value = (value + Math.imul(sideValue, 2_246_822_519)) >>> 0;
	value = (value + Math.imul(salt + 1, 3_266_489_917)) >>> 0;

	return value;
}
