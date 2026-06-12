import type {
	MdOrder,
	MdOrderbook,
	MdOrderbookLevel,
	Price,
	TradeSide,
	UnixMs,
	Volume
} from '../../contracts/types.ts';
import {
	DEPTH_END_OF_BATCH_FLAG,
	DepthCommand,
	type MarketDepthRecordWriter
} from '../../shared/file-ops/depth.ts';
import { roundToTick } from '../shared/price.ts';
import {
	ORDERBOOK_ASK_ORDER_ID_OFFSET,
	ORDERBOOK_LEVEL_COUNT,
	ORDERBOOK_ORDER_ID_LEVEL_MULTIPLIER,
	ORDERBOOK_ORDER_ID_TIME_MULTIPLIER,
	ORDERBOOK_QUEUE_ID_LEVEL_MULTIPLIER,
	ORDERBOOK_SNAPSHOT_INTERVAL_MS
} from './depth-orderbook-constants.ts';

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
	private pendingCommand: DepthCommand | undefined;
	private pendingFlags = 0;
	private pendingNumOrders = 0;
	private pendingPrice = 0;
	private pendingQuantity = 0;
	private pendingTime = 0;
	private previousAnchorPriceTicks: number | undefined;
	private previousConfluencePriceTicks: number | undefined;
	private previousConfluenceSide: DepthSide | undefined;
	private lastSnapshotTime: UnixMs | undefined;

	constructor(
		private readonly writer: MarketDepthRecordWriter,
		private readonly tickSize: number,
		private readonly levelCount = ORDERBOOK_LEVEL_COUNT
	) {}

	reset() {
		this.pendingCommand = undefined;
		this.previousAnchorPriceTicks = undefined;
		this.previousConfluencePriceTicks = undefined;
		this.previousConfluenceSide = undefined;
		this.lastSnapshotTime = undefined;
	}

	pushTickValues(time: UnixMs, price: Price, volume: Volume, side: TradeSide) {
		const anchorPriceTicks = Math.round(price / this.tickSize);
		const confluencePriceTicks = getConfluencePriceTicks(anchorPriceTicks, side);
		const confluenceSide = getConfluenceSide(side);

		if (this.shouldWriteFullSnapshot(time)) {
			this.writeFullSnapshot(time, volume, side, anchorPriceTicks);
			this.previousAnchorPriceTicks = anchorPriceTicks;
			this.previousConfluencePriceTicks = confluencePriceTicks;
			this.previousConfluenceSide = confluenceSide;
			this.lastSnapshotTime = time;

			return;
		}

		this.writeIncrementalUpdate(time, volume, side, anchorPriceTicks);
		this.previousAnchorPriceTicks = anchorPriceTicks;
		this.previousConfluencePriceTicks = confluencePriceTicks;
		this.previousConfluenceSide = confluenceSide;
	}

	private shouldWriteFullSnapshot(time: UnixMs) {
		if (this.previousAnchorPriceTicks === undefined || this.lastSnapshotTime === undefined) {
			return true;
		}

		return time - this.lastSnapshotTime >= ORDERBOOK_SNAPSHOT_INTERVAL_MS;
	}

	private writeFullSnapshot(
		time: UnixMs,
		volume: Volume,
		tradeSide: TradeSide,
		anchorPriceTicks: number
	) {
		this.pushBatchRecordValues(DepthCommand.ClearBook, time, 0, 0, 0, 0);

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			this.pushSnapshotLevelRecord(
				DepthCommand.AddBidLevel,
				time,
				volume,
				tradeSide,
				anchorPriceTicks,
				'BUY',
				levelIndex
			);
		}

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			this.pushSnapshotLevelRecord(
				DepthCommand.AddAskLevel,
				time,
				volume,
				tradeSide,
				anchorPriceTicks,
				'SELL',
				levelIndex
			);
		}

		this.finishBatch();
	}

	private writeIncrementalUpdate(
		time: UnixMs,
		volume: Volume,
		tradeSide: TradeSide,
		anchorPriceTicks: number
	) {
		const previousAnchorPriceTicks = this.previousAnchorPriceTicks;
		if (previousAnchorPriceTicks === undefined) {
			this.writeFullSnapshot(time, volume, tradeSide, anchorPriceTicks);

			return;
		}

		this.writeRangeChanges(time, previousAnchorPriceTicks, anchorPriceTicks, 'BUY');
		this.writeRangeChanges(time, previousAnchorPriceTicks, anchorPriceTicks, 'SELL');
		const currentConfluencePriceTicks = getConfluencePriceTicks(anchorPriceTicks, tradeSide);
		const currentConfluenceSide = getConfluenceSide(tradeSide);
		this.writeConfluenceRestore(
			time,
			anchorPriceTicks,
			currentConfluencePriceTicks,
			currentConfluenceSide
		);
		this.writeCurrentConfluence(time, volume, currentConfluencePriceTicks, currentConfluenceSide);
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

		const anchorDelta = anchorPriceTicks - previousAnchorPriceTicks;
		if (Math.abs(anchorDelta) >= this.levelCount) {
			this.writeFullRangeChanges(time, previousAnchorPriceTicks, anchorPriceTicks, side);

			return;
		}

		if (side === 'BUY') {
			this.writeBidRangeChanges(time, previousAnchorPriceTicks, anchorPriceTicks, anchorDelta);

			return;
		}

		this.writeAskRangeChanges(time, previousAnchorPriceTicks, anchorPriceTicks, anchorDelta);
	}

	private writeFullRangeChanges(
		time: UnixMs,
		previousAnchorPriceTicks: number,
		anchorPriceTicks: number,
		side: DepthSide
	) {
		const deleteCommand = getDeleteCommand(side);
		const addCommand = getAddCommand(side);

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			const priceTicks = getLevelPriceTicks(previousAnchorPriceTicks, side, levelIndex);

			this.pushBaseLevelRecord(deleteCommand, time, priceTicks, side);
		}

		for (let levelIndex = 0; levelIndex < this.levelCount; levelIndex++) {
			const priceTicks = getLevelPriceTicks(anchorPriceTicks, side, levelIndex);

			this.pushBaseLevelRecord(addCommand, time, priceTicks, side);
		}
	}

	private writeBidRangeChanges(
		time: UnixMs,
		previousAnchorPriceTicks: number,
		anchorPriceTicks: number,
		anchorDelta: number
	) {
		if (anchorDelta > 0) {
			this.writePriceTickRange(
				getDeleteCommand('BUY'),
				time,
				'BUY',
				anchorPriceTicks - this.levelCount - 1,
				previousAnchorPriceTicks - this.levelCount,
				-1
			);
			this.writePriceTickRange(
				getAddCommand('BUY'),
				time,
				'BUY',
				anchorPriceTicks - 1,
				previousAnchorPriceTicks,
				-1
			);

			return;
		}

		this.writePriceTickRange(
			getDeleteCommand('BUY'),
			time,
			'BUY',
			previousAnchorPriceTicks - 1,
			anchorPriceTicks,
			-1
		);
		this.writePriceTickRange(
			getAddCommand('BUY'),
			time,
			'BUY',
			previousAnchorPriceTicks - this.levelCount - 1,
			anchorPriceTicks - this.levelCount,
			-1
		);
	}

	private writeAskRangeChanges(
		time: UnixMs,
		previousAnchorPriceTicks: number,
		anchorPriceTicks: number,
		anchorDelta: number
	) {
		if (anchorDelta > 0) {
			this.writePriceTickRange(
				getDeleteCommand('SELL'),
				time,
				'SELL',
				previousAnchorPriceTicks + 1,
				anchorPriceTicks,
				1
			);
			this.writePriceTickRange(
				getAddCommand('SELL'),
				time,
				'SELL',
				previousAnchorPriceTicks + this.levelCount + 1,
				anchorPriceTicks + this.levelCount,
				1
			);

			return;
		}

		this.writePriceTickRange(
			getDeleteCommand('SELL'),
			time,
			'SELL',
			anchorPriceTicks + this.levelCount + 1,
			previousAnchorPriceTicks + this.levelCount,
			1
		);
		this.writePriceTickRange(
			getAddCommand('SELL'),
			time,
			'SELL',
			anchorPriceTicks + 1,
			previousAnchorPriceTicks,
			1
		);
	}

	private writePriceTickRange(
		command: DepthCommand,
		time: UnixMs,
		side: DepthSide,
		startPriceTicks: number,
		endPriceTicks: number,
		step: 1 | -1
	) {
		for (
			let priceTicks = startPriceTicks;
			step > 0 ? priceTicks <= endPriceTicks : priceTicks >= endPriceTicks;
			priceTicks += step
		) {
			this.pushBaseLevelRecord(command, time, priceTicks, side);
		}
	}

	private writeConfluenceRestore(
		time: UnixMs,
		anchorPriceTicks: number,
		currentConfluencePriceTicks: number,
		currentConfluenceSide: DepthSide
	) {
		const previousPriceTicks = this.previousConfluencePriceTicks;
		const previousSide = this.previousConfluenceSide;
		if (previousPriceTicks === undefined || previousSide === undefined) return;
		if (!isPriceTickInRange(previousPriceTicks, anchorPriceTicks, previousSide, this.levelCount))
			return;
		if (
			previousPriceTicks === currentConfluencePriceTicks &&
			previousSide === currentConfluenceSide
		)
			return;

		this.pushBaseLevelRecord(
			getModifyCommand(previousSide),
			time,
			previousPriceTicks,
			previousSide
		);
	}

	private writeCurrentConfluence(
		time: UnixMs,
		volume: Volume,
		priceTicks: number,
		side: DepthSide
	) {
		this.pushConfluenceLevelRecord(getModifyCommand(side), time, volume, priceTicks, side);
	}

	private pushSnapshotLevelRecord(
		command: DepthCommand,
		time: UnixMs,
		volume: Volume,
		tradeSide: TradeSide,
		anchorPriceTicks: number,
		side: DepthSide,
		levelIndex: number
	) {
		const priceTicks = getLevelPriceTicks(anchorPriceTicks, side, levelIndex);

		if (isConfluencePriceTicks(anchorPriceTicks, tradeSide, side, priceTicks)) {
			this.pushConfluenceLevelRecord(command, time, volume, priceTicks, side);

			return;
		}

		this.pushBaseLevelRecord(command, time, priceTicks, side);
	}

	private pushConfluenceLevelRecord(
		command: DepthCommand,
		time: UnixMs,
		volume: Volume,
		priceTicks: number,
		side: DepthSide
	) {
		const baseNumOrders = getBaseNumOrders(priceTicks, side);
		const numOrders = baseNumOrders + Math.min(4, Math.max(1, Math.ceil(volume / 25)));
		const quantity = getBaseQuantity(priceTicks, side, baseNumOrders) + volume;

		this.pushBatchRecordValues(
			command,
			time,
			0,
			numOrders,
			priceTicksToPrice(priceTicks, this.tickSize),
			quantity
		);
	}

	private pushBaseLevelRecord(
		command: DepthCommand,
		time: UnixMs,
		priceTicks: number,
		side: DepthSide
	) {
		const shouldClearLevel =
			command === DepthCommand.DeleteBidLevel || command === DepthCommand.DeleteAskLevel;
		const numOrders = shouldClearLevel ? 0 : getBaseNumOrders(priceTicks, side);
		const quantity = shouldClearLevel ? 0 : getBaseQuantity(priceTicks, side, numOrders);

		this.pushBatchRecordValues(
			command,
			time,
			0,
			numOrders,
			priceTicksToPrice(priceTicks, this.tickSize),
			quantity
		);
	}

	private pushBatchRecordValues(
		command: DepthCommand,
		time: UnixMs,
		flags: number,
		numOrders: number,
		price: Price,
		quantity: Volume
	) {
		if (this.pendingCommand !== undefined) {
			this.writer.pushRecordValues(
				this.pendingTime,
				this.pendingCommand,
				this.pendingFlags,
				this.pendingNumOrders,
				this.pendingPrice,
				this.pendingQuantity
			);
		}

		this.pendingCommand = command;
		this.pendingFlags = flags;
		this.pendingNumOrders = numOrders;
		this.pendingPrice = price;
		this.pendingQuantity = quantity;
		this.pendingTime = time;
	}

	private finishBatch() {
		if (this.pendingCommand === undefined) {
			return;
		}

		this.writer.pushRecordValues(
			this.pendingTime,
			this.pendingCommand,
			this.pendingFlags | DEPTH_END_OF_BATCH_FLAG,
			this.pendingNumOrders,
			this.pendingPrice,
			this.pendingQuantity
		);
		this.pendingCommand = undefined;
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
	const numOrders = getBaseNumOrders(priceTicks, side);
	const quantity = getBaseQuantity(priceTicks, side, numOrders);

	return {
		numOrders,
		price: priceTicksToPrice(priceTicks, tickSize),
		priceTicks,
		quantity,
		side
	};
}

function priceTicksToPrice(priceTicks: number, tickSize: number) {
	const price = priceTicks * tickSize;

	if (tickSize === 0.25) {
		return price;
	}

	return roundToTick(price, tickSize);
}

function getBaseNumOrders(priceTicks: number, side: DepthSide) {
	return 3 + (hashLevelInput(priceTicks, side, 0) % 18);
}

function getBaseQuantity(priceTicks: number, side: DepthSide, numOrders: number) {
	return numOrders + 5 + (hashLevelInput(priceTicks, side, 1) % 80);
}

function getConfluencePriceTicks(anchorPriceTicks: number, tradeSide: TradeSide) {
	return tradeSide === 'ask' ? anchorPriceTicks + 1 : anchorPriceTicks - 1;
}

function getConfluenceSide(tradeSide: TradeSide): DepthSide {
	return tradeSide === 'ask' ? 'SELL' : 'BUY';
}

function createConfluenceKey(anchorPriceTicks: number, tradeSide: TradeSide): ConfluenceKey {
	return {
		priceTicks: getConfluencePriceTicks(anchorPriceTicks, tradeSide),
		side: getConfluenceSide(tradeSide)
	};
}

function isConfluencePriceTicks(
	anchorPriceTicks: number,
	tradeSide: TradeSide,
	side: DepthSide,
	priceTicks: number
) {
	if (tradeSide === 'ask') {
		return side === 'SELL' && priceTicks === anchorPriceTicks + 1;
	}

	return side === 'BUY' && priceTicks === anchorPriceTicks - 1;
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
	const sideOffset = side === 'SELL' ? ORDERBOOK_ASK_ORDER_ID_OFFSET : 0n;

	return (
		BigInt(time) * ORDERBOOK_ORDER_ID_TIME_MULTIPLIER +
		sideOffset +
		BigInt(levelIndex) * ORDERBOOK_ORDER_ID_LEVEL_MULTIPLIER +
		BigInt(orderIndex + 1)
	);
}

function createQueueId(levelIndex: number, orderIndex: number) {
	return BigInt(levelIndex + 1) * ORDERBOOK_QUEUE_ID_LEVEL_MULTIPLIER + BigInt(orderIndex + 1);
}

function hashLevelInput(priceTicks: number, side: DepthSide, salt: number) {
	const sideValue = side === 'BUY' ? 17 : 31;
	let value = Math.imul(priceTicks, 2_654_435_761);

	value = (value + Math.imul(sideValue, 2_246_822_519)) >>> 0;
	value = (value + Math.imul(salt + 1, 3_266_489_917)) >>> 0;

	return value;
}
