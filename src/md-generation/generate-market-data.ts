import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { getSymbolConfig, type SymbolConfig } from '../contracts/symbols.ts';
import { TIMEFRAME_DEFINITIONS } from '../contracts/timeframes.ts';
import type {
	GenerationResult,
	GenerationProgress,
	GeneratorInputs,
	MdCandle,
	MdCandleVolumeByPrice,
	OutputMetadata,
	OutputFiles
} from '../contracts/types.ts';
import { getOutputFiles as buildOutputFiles } from '../shared/output-files.ts';
import {
	CANDLE_ROW_HEADER,
	CandleRowWriter,
	PRICE_LEVEL_CANDLE_ROW_HEADER,
	toStoredCandleRow,
	toStoredPriceLevelCandleRow
} from '../shared/file-ops/csv.ts';
import { MarketDepthSessionWriter } from '../shared/file-ops/depth.ts';
import { SCID_EPOCH_OFFSET_MS, ScidTickWriter } from '../shared/file-ops/scid.ts';
import {
	createBarId,
	IntervalTimeAggregator,
	PriceLevelAggregator,
	RangeAggregator,
	TickAggregator,
	VolumeAggregator
} from './candles.ts';
import { getPreviousSessionStart, getSessionStart, isTradingSessionStart } from './market-time.ts';
import { OrderbookDepthStreamer } from './orderbook.ts';
import { RingBuffer } from './ring-buffer.ts';
import {
	countGeneratedTickTimeBuckets,
	deriveSessionSeed,
	getFirstSessionTickPrice,
	getSessionOpenPrice,
	getSessionTickTime,
	RANDOM_INCREMENT,
	RANDOM_MULTIPLIER,
	RANDOM_UNIT
} from './ticks.ts';

const PRICE_LEVEL_SESSIONS = 30;
const DEPTH_SESSIONS = 30;
const RING_BUFFER_BAR_COUNT = 20_000;
const UNIX_EPOCH_MS = 0;

type CandleEmissions = {
	daily: MdCandle[];
	priceLevel: MdCandleVolumeByPrice[];
	range10: MdCandle[];
	seconds15: MdCandle[];
	tick100: MdCandle[];
	minutes5: MdCandle[];
	volume500: MdCandle[];
};

type GenerateMarketDataOptions = {
	onSessionComplete?: (progress: GenerationProgress) => void;
};

type MutableDailySession = {
	askVolume: number;
	bidVolume: number;
	close: number;
	high: number;
	low: number;
	open: number;
	priceVolume: number;
	volume: number;
};

export async function generateMarketData(
	inputs: GeneratorInputs,
	options: GenerateMarketDataOptions = {}
): Promise<GenerationResult> {
	// Resolve output scope and retained-bar windows.
	const symbolConfig = getSymbolConfig(inputs.symbol);
	const files = getOutputFiles(inputs);
	const seconds15BarsPerSession = countSessionBuckets(
		inputs.ticksPerSession,
		TIMEFRAME_DEFINITIONS['15s'].milliseconds
	);
	const minutes5BarsPerSession = countSessionBuckets(
		inputs.ticksPerSession,
		TIMEFRAME_DEFINITIONS['5m'].milliseconds
	);
	const seconds15StartSession = getRingRetainedSessionStart(
		inputs.sessionCount,
		seconds15BarsPerSession
	);
	const minutes5StartSession = getRingRetainedSessionStart(
		inputs.sessionCount,
		minutes5BarsPerSession
	);

	// Initialize streaming aggregators and retained output buffers.
	const priceLevelAggregator = new PriceLevelAggregator();
	const range10Aggregator = new RangeAggregator(
		TIMEFRAME_DEFINITIONS['10r'].size,
		symbolConfig.tickSize
	);
	const tick100Aggregator = new TickAggregator(TIMEFRAME_DEFINITIONS['100t'].size);
	const volume500Aggregator = new VolumeAggregator(TIMEFRAME_DEFINITIONS['500v'].size);
	const orderbook = new MarketDepthSessionWriter(files.orderbook, symbolConfig.symbolId);
	const orderbookStreamer = new OrderbookDepthStreamer(orderbook, symbolConfig.tickSize);
	const seconds15Aggregator = new IntervalTimeAggregator(
		TIMEFRAME_DEFINITIONS['15s'].milliseconds,
		seconds15StartSession * seconds15BarsPerSession
	);
	const minutes5Aggregator = new IntervalTimeAggregator(
		TIMEFRAME_DEFINITIONS['5m'].milliseconds,
		minutes5StartSession * minutes5BarsPerSession
	);
	const volume500Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const range10Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const seconds15Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const minutes5Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const tick100Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const scid = new ScidTickWriter(files.scid);
	const priceLevel = new CandleRowWriter(
		files.priceLevel,
		PRICE_LEVEL_CANDLE_ROW_HEADER,
		toStoredPriceLevelCandleRow
	);
	const daily = new CandleRowWriter(files.daily, CANDLE_ROW_HEADER, toStoredCandleRow);

	const counts = {
		daily: 0,
		minutes5: 0,
		orderbook: 0,
		priceLevel: 0,
		range10: 0,
		seconds15: 0,
		tick100: 0,
		ticks: 0,
		volume500: 0
	};
	const priceLevelRange = createRangeTracker();

	await Promise.all([scid.open(), orderbook.open(), priceLevel.open(), daily.open()]);

	try {
		const sessionStarts = getSessionStarts(inputs);

		// Reuse emission arrays across sessions to keep the hot path allocation-light.
		const emitted: CandleEmissions = {
			daily: [],
			minutes5: [],
			priceLevel: [],
			range10: [],
			seconds15: [],
			tick100: [],
			volume500: []
		};

		let previousClose = inputs.startPrice;
		for (let sessionIndex = 0; sessionIndex < inputs.sessionCount; sessionIndex++) {
			const sessionStart = sessionStarts[sessionIndex];
			let sessionTicks = 0;

			// Reset per-session emissions before building or padding the session.
			emitted.daily.length = 0;
			emitted.minutes5.length = 0;
			emitted.priceLevel.length = 0;
			emitted.range10.length = 0;

			emitted.seconds15.length = 0;
			emitted.tick100.length = 0;
			emitted.volume500.length = 0;

			if (sessionStart < UNIX_EPOCH_MS) {
				emitted.daily.push(createZeroDailyCandle(counts.daily));
			} else {
				// Generate real ticks and close aggregations that reset at session boundaries.
				const shouldEmitPriceLevel = isInLastSessions(inputs, sessionIndex, PRICE_LEVEL_SESSIONS);
				const shouldEmitDepth = isInLastSessions(inputs, sessionIndex, DEPTH_SESSIONS);
				if (shouldEmitDepth) {
					await orderbook.startSession(sessionStart);
					orderbookStreamer.reset();
				}

				const sessionOpenPrice = getSessionOpenPrice(
					previousClose,
					inputs,
					symbolConfig,
					sessionIndex
				);

				previousClose = generateSessionTicksIntoOutputs(
					inputs,
					symbolConfig,
					sessionIndex,
					sessionStart,
					sessionOpenPrice,
					shouldEmitPriceLevel,
					sessionIndex >= seconds15StartSession,
					sessionIndex >= minutes5StartSession,
					scid,
					counts.daily,
					seconds15Aggregator,
					minutes5Aggregator,
					range10Aggregator,
					tick100Aggregator,
					volume500Aggregator,
					shouldEmitDepth,
					orderbookStreamer,
					priceLevelAggregator,
					emitted
				);

				emitted.range10.push(
					...range10Aggregator.finish(
						// Sierra range bars use the first generated trade of the next session
						// when resolving session-boundary opens and closes.
						getNextGeneratedSessionOpen(
							inputs,
							symbolConfig,
							sessionStarts,
							sessionIndex,
							previousClose
						)
					)
				);

				emitted.tick100.push(...tick100Aggregator.finish());
				emitted.volume500.push(...volume500Aggregator.finish());

				sessionTicks = inputs.ticksPerSession;
				counts.ticks += sessionTicks;
			}

			// Retain only bounded intraday outputs while writing full daily/price-level streams.
			seconds15Ring.pushMany(emitted.seconds15);
			minutes5Ring.pushMany(emitted.minutes5);
			range10Ring.pushMany(emitted.range10);
			tick100Ring.pushMany(emitted.tick100);
			volume500Ring.pushMany(emitted.volume500);

			// Keep public counts aligned with retained buffers and streamed files.
			counts.seconds15 = seconds15Ring.length;
			counts.minutes5 = minutes5Ring.length;
			counts.range10 = range10Ring.length;
			counts.tick100 = tick100Ring.length;
			counts.volume500 = volume500Ring.length;
			counts.daily += emitted.daily.length;
			counts.priceLevel += emitted.priceLevel.length;

			priceLevelRange.pushMany(emitted.priceLevel);

			// Daily and price-level outputs stream to disk because they are not retained rings.
			await Promise.all([daily.write(emitted.daily), priceLevel.write(emitted.priceLevel)]);

			options.onSessionComplete?.({
				completed: sessionIndex + 1,
				sessionIndex,
				ticks: sessionTicks,
				total: inputs.sessionCount
			});
		}

		// Flush any aggregators that can span the final generated session.
		const final = {
			daily: [],
			minutes5: minutes5Aggregator.finish(),
			priceLevel: priceLevelAggregator.finish(),
			range10: range10Aggregator.finish(),
			seconds15: seconds15Aggregator.finish(),
			tick100: tick100Aggregator.finish(),
			volume500: volume500Aggregator.finish()
		};

		// Merge final emissions into retained buffers and stream-backed outputs.
		seconds15Ring.pushMany(final.seconds15);
		minutes5Ring.pushMany(final.minutes5);
		range10Ring.pushMany(final.range10);
		tick100Ring.pushMany(final.tick100);
		volume500Ring.pushMany(final.volume500);

		// Stream-backed outputs need a final write after their aggregators flush.
		await Promise.all([priceLevel.write(final.priceLevel), daily.write(final.daily)]);

		counts.priceLevel += final.priceLevel.length;
		priceLevelRange.pushMany(final.priceLevel);

		// Ring-backed outputs derive counts from retained buffers after the final flush.
		counts.volume500 = volume500Ring.length;
		counts.range10 = range10Ring.length;
		counts.tick100 = tick100Ring.length;
		counts.seconds15 = seconds15Ring.length;
		counts.minutes5 = minutes5Ring.length;
		counts.daily += final.daily.length;

		// Materialize retained buffers once for metadata and CSV writes.
		const volume500Rows = [...volume500Ring.iterate()];
		const range10Rows = [...range10Ring.iterate()];
		const tick100Rows = [...tick100Ring.iterate()];
		const seconds15Rows = [...seconds15Ring.iterate()];
		const minutes5Rows = [...minutes5Ring.iterate()];

		const metadata = createOutputMetadata({
			'100t': getCandleRange(tick100Rows),
			'10r': getCandleRange(range10Rows),
			'15s': getCandleRange(seconds15Rows),
			'1d': {
				endTime: getLastNonZeroSessionStart(sessionStarts),
				startTime: getFirstNonZeroSessionStart(sessionStarts)
			},
			'1s': priceLevelRange.getRange(),
			'500v': getCandleRange(volume500Rows),
			'5m': getCandleRange(minutes5Rows)
		});

		await Promise.all([
			writeCandles(files.range10, range10Rows),
			writeCandles(files.tick100, tick100Rows),
			writeCandles(files.volume500, volume500Rows),
			writeCandles(files.seconds15, seconds15Rows),
			writeCandles(files.minutes5, minutes5Rows),
			writeOutputMetadata(files.metadata, metadata)
		]);

		counts.orderbook = orderbook.recordCount;
	} finally {
		// Close writers even if generation fails mid-run.
		await Promise.all([scid.close(), orderbook.close(), priceLevel.close(), daily.close()]);
	}

	return {
		counts,
		files,
		inputs
	};
}

export function getOutputFiles(inputs: GeneratorInputs): OutputFiles {
	return buildOutputFiles(inputs.symbol, inputs.outputDir);
}

function generateSessionTicksIntoOutputs(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionIndex: number,
	sessionStart: number,
	sessionStartPrice: number,
	shouldEmitPriceLevel: boolean,
	shouldEmitSeconds15: boolean,
	shouldEmitMinutes5: boolean,
	scid: ScidTickWriter,
	dailyPos: number,
	seconds15Aggregator: IntervalTimeAggregator,
	minutes5Aggregator: IntervalTimeAggregator,
	range10Aggregator: RangeAggregator,
	tick100Aggregator: TickAggregator,
	volume500Aggregator: VolumeAggregator,
	shouldEmitDepth: boolean,
	orderbookStreamer: OrderbookDepthStreamer,
	priceLevelAggregator: PriceLevelAggregator,
	emitted: CandleEmissions
) {
	const ticksPerSession = inputs.ticksPerSession;
	const openVolatilityEnd = ticksPerSession * 0.1;
	const closingVolatilityStart = ticksPerSession * 0.85;
	let randomState = deriveSessionSeed(inputs.seed, symbolConfig.symbolId, sessionIndex) >>> 0;
	let priceTicks = Math.round(sessionStartPrice / symbolConfig.tickSize);
	const tickSize = symbolConfig.tickSize;
	const dailySession = createMutableDailySession();

	for (let index = 0; index < ticksPerSession; index++) {
		// Time and volatility schedule.
		const time = getSessionTickTime(sessionStart, ticksPerSession, index);
		const volatility = index < openVolatilityEnd ? 4 : index > closingVolatilityStart ? 3 : 1;

		// Advance price.
		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const signedMove = randomState * RANDOM_UNIT * 2 - 1;

		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const moveTicks = Math.round(
			signedMove * volatility * (randomState * RANDOM_UNIT > 0.7 ? 2 : 1)
		);
		priceTicks += moveTicks;

		const price = priceTicks * tickSize;

		// Advance side and volume.
		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const isAsk = randomState * RANDOM_UNIT > 0.5;
		const side = isAsk ? 'ask' : 'bid';

		randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
		const volumeRoll = randomState * RANDOM_UNIT;

		let volume: number;
		if (volumeRoll > 0.995) {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 251 + Math.floor(randomState * RANDOM_UNIT * 750);
		} else if (volumeRoll > 0.95) {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 26 + Math.floor(randomState * RANDOM_UNIT * 225);
		} else {
			randomState = (randomState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
			volume = 1 + Math.floor(randomState * RANDOM_UNIT * 25);
		}

		// Raw tick output and daily aggregation.
		scid.pushScDateTimeMsVolumeValues(
			(time - SCID_EPOCH_OFFSET_MS) * 1000,
			price,
			volume,
			isAsk ? 0 : volume,
			isAsk ? volume : 0
		);

		addTickToDailySession(dailySession, price, volume, side, index);

		// Intraday candle aggregation.
		if (shouldEmitSeconds15) {
			seconds15Aggregator.pushTickValues(time, price, volume, emitted.seconds15, side);
		}

		if (shouldEmitMinutes5) {
			minutes5Aggregator.pushTickValues(
				time,
				price,
				volume,
				emitted.minutes5,
				shouldEmitPriceLevel ? undefined : side
			);
		}

		volume500Aggregator.pushTickValues(time, price, volume, emitted.volume500, side);
		range10Aggregator.pushTickValues(time, price, volume, emitted.range10, side);
		tick100Aggregator.pushTickValues(time, price, volume, emitted.tick100, side);
		if (shouldEmitDepth) {
			orderbookStreamer.pushTickValues(time, price, volume, side);
		}

		// Price-level aggregation is retained only for the trailing session window.
		if (!shouldEmitPriceLevel) continue;

		priceLevelAggregator.pushTickValues(time, price, volume, emitted.priceLevel, side);
	}

	emitted.daily.push(finalizeDailySession(dailySession, dailyPos, sessionStart));

	return priceTicks * tickSize;
}

function getSessionStarts(inputs: GeneratorInputs) {
	const sessionStarts: number[] = [];
	let cursor = getSessionStart(inputs.anchorIso, 0);

	// Walk backward from the anchor until enough trading sessions are found.
	while (sessionStarts.length < inputs.sessionCount) {
		if (isTradingSessionStart(cursor)) {
			sessionStarts.push(cursor);
		}

		cursor = getPreviousSessionStart(cursor);
	}

	return sessionStarts.reverse();
}

async function writeCandles(filePath: string, candles: Iterable<MdCandle>) {
	const writer = new CandleRowWriter(filePath, CANDLE_ROW_HEADER, toStoredCandleRow);

	await writer.open();

	try {
		await writer.write(candles);
	} finally {
		await writer.close();
	}
}

function createOutputMetadata(timeframes: OutputMetadata['timeframes']): OutputMetadata {
	return { timeframes };
}

async function writeOutputMetadata(filePath: string, metadata: OutputMetadata) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(metadata, null, '\t')}\n`);
}

function getCandleRange(candles: MdCandle[]) {
	const first = candles[0];
	const last = candles.at(-1);

	if (first === undefined || last === undefined) {
		throw new Error('Cannot write metadata for empty candle range');
	}

	return {
		endTime: last.time,
		startTime: first.time
	};
}

function createRangeTracker() {
	let first: MdCandle | undefined;
	let last: MdCandle | undefined;

	// Track streamed candle bounds without retaining every row in memory.
	return {
		getRange: () => {
			if (first === undefined || last === undefined) {
				throw new Error('Cannot write metadata for empty candle range');
			}

			return {
				endTime: last.time,
				startTime: first.time
			};
		},
		pushMany: (candles: MdCandle[]) => {
			if (candles.length === 0) return;

			first ??= candles[0];
			last = candles.at(-1);
		}
	};
}

function getFirstNonZeroSessionStart(sessionStarts: number[]) {
	const start = sessionStarts.find((sessionStart) => sessionStart >= UNIX_EPOCH_MS);
	if (start === undefined) throw new Error('Cannot write metadata without a non-zero session');

	return start;
}

function getLastNonZeroSessionStart(sessionStarts: number[]) {
	const start = sessionStarts.findLast((sessionStart) => sessionStart >= UNIX_EPOCH_MS);
	if (start === undefined) throw new Error('Cannot write metadata without a non-zero session');

	return start;
}

function isInLastSessions(inputs: GeneratorInputs, sessionIndex: number, sessionWindow: number) {
	return sessionIndex >= Math.max(0, inputs.sessionCount - sessionWindow);
}

function createMutableDailySession(): MutableDailySession {
	return {
		askVolume: 0,
		bidVolume: 0,
		close: 0,
		high: 0,
		low: 0,
		open: 0,
		priceVolume: 0,
		volume: 0
	};
}

function addTickToDailySession(
	dailySession: MutableDailySession,
	price: number,
	volume: number,
	side: 'ask' | 'bid',
	index: number
) {
	// The first tick anchors the daily OHLC range.
	if (index === 0) {
		dailySession.open = price;
		dailySession.high = price;
		dailySession.low = price;
	} else {
		dailySession.high = Math.max(dailySession.high, price);
		dailySession.low = Math.min(dailySession.low, price);
	}

	// Every tick contributes to close, volume, and VWAP inputs.
	dailySession.close = price;
	dailySession.volume += volume;
	dailySession.bidVolume += side === 'bid' ? volume : 0;
	dailySession.askVolume += side === 'ask' ? volume : 0;
	dailySession.priceVolume += price * volume;
}

function finalizeDailySession(
	dailySession: MutableDailySession,
	pos: number,
	sessionStart: number
): MdCandle {
	return {
		askVolume: dailySession.askVolume,
		bidVolume: dailySession.bidVolume,
		close: dailySession.close,
		high: dailySession.high,
		id: createBarId(sessionStart, 0),
		low: dailySession.low,
		open: dailySession.open,
		pos,
		time: sessionStart,
		volume: dailySession.volume,
		vwap: dailySession.priceVolume / dailySession.volume
	};
}

function getNextGeneratedSessionOpen(
	inputs: GeneratorInputs,
	symbolConfig: SymbolConfig,
	sessionStarts: number[],
	sessionIndex: number,
	previousClose: number
) {
	const nextSessionIndex = sessionIndex + 1;
	if (nextSessionIndex >= inputs.sessionCount) return undefined;
	if (sessionStarts[nextSessionIndex] < UNIX_EPOCH_MS) return undefined;

	// First calculate the theoretical session open, then replay the first tick's move.
	const sessionOpenPrice = getSessionOpenPrice(
		previousClose,
		inputs,
		symbolConfig,
		nextSessionIndex
	);

	return getFirstSessionTickPrice(inputs, symbolConfig, nextSessionIndex, sessionOpenPrice);
}

function getRingRetainedSessionStart(sessionCount: number, barsPerSession: number) {
	return Math.max(0, sessionCount - Math.ceil(RING_BUFFER_BAR_COUNT / barsPerSession));
}

function countSessionBuckets(ticksPerSession: number, bucketMs: number) {
	return countGeneratedTickTimeBuckets(ticksPerSession, bucketMs);
}

function createZeroDailyCandle(sequence: number): MdCandle {
	return {
		askVolume: 0,
		bidVolume: 0,
		close: 0,
		high: 0,
		id: createBarId(UNIX_EPOCH_MS, sequence),
		low: 0,
		open: 0,
		pos: sequence,
		time: UNIX_EPOCH_MS,
		volume: 0,
		vwap: 0
	};
}
