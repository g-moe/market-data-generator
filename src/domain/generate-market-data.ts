import { join } from 'node:path';

import { VOLUME_BAR_SIZE } from '../contracts/defaults.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import type {
	GenerationResult,
	GenerationProgress,
	GeneratorInputs,
	MdCandle,
	MdCandleVolumeByPrice,
	OutputFiles
} from '../contracts/types.ts';
import {
	CandleJsonArrayWriter,
	toStoredCandle,
	toStoredPriceLevelCandle
} from '../io/json.ts';
import { ScidTickWriter } from '../io/scid.ts';
import {
	createBarId,
	PriceLevelAggregator,
	TimeAggregator,
	VolumeAggregator
} from './candles.ts';
import {
	getPreviousSessionStart,
	getSessionStart,
	isTradingSessionStart
} from './market-time.ts';
import { RingBuffer } from './ring-buffer.ts';
import { generateSessionTicksForStart } from './ticks.ts';

const PRICE_LEVEL_SESSIONS = 30;
const RING_BUFFER_BAR_COUNT = 20_000;
const UNIX_EPOCH_MS = 0;

type GenerateMarketDataOptions = {
	onSessionComplete?: (progress: GenerationProgress) => void;
};

export async function generateMarketData(
	inputs: GeneratorInputs,
	options: GenerateMarketDataOptions = {}
): Promise<GenerationResult> {
	const symbolConfig = getSymbolConfig(inputs.symbol);
	const files = getOutputFiles(inputs);
	const priceLevelAggregator = new PriceLevelAggregator();
	const volume500Aggregator = new VolumeAggregator(VOLUME_BAR_SIZE);
	const seconds15Aggregator = new TimeAggregator(
		(time) => Math.floor(time / 15_000) * 15_000
	);
	const minutes5Aggregator = new TimeAggregator(
		(time) => Math.floor(time / 300_000) * 300_000
	);
	const dailyAggregator = new TimeAggregator((time) => time);
	const volume500Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const seconds15Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const minutes5Ring = new RingBuffer<MdCandle>(RING_BUFFER_BAR_COUNT);
	const scid = new ScidTickWriter(files.scid);
	const priceLevel = new CandleJsonArrayWriter(
		files.priceLevel,
		toStoredPriceLevelCandle
	);
	const daily = new CandleJsonArrayWriter(files.daily, toStoredCandle);
	const counts = {
		daily: 0,
		minutes5: 0,
		priceLevel: 0,
		seconds15: 0,
		ticks: 0,
		volume500: 0
	};

	await Promise.all([scid.open(), priceLevel.open(), daily.open()]);

	try {
		const sessionStarts = getSessionStarts(inputs);
		for (
			let sessionIndex = 0;
			sessionIndex < inputs.sessionCount;
			sessionIndex++
		) {
			const sessionStart = sessionStarts[sessionIndex];
			let sessionTicks = 0;
			const emitted: {
				daily: MdCandle[];
				priceLevel: MdCandleVolumeByPrice[];
				seconds15: MdCandle[];
				minutes5: MdCandle[];
				volume500: MdCandle[];
			} = {
				daily: [],
				minutes5: [],
				priceLevel: [],
				seconds15: [],
				volume500: []
			};
			if (sessionStart < UNIX_EPOCH_MS) {
				emitted.daily.push(createZeroDailyCandle(counts.daily));
			} else {
				generateSessionTicksForStart(
					inputs,
					symbolConfig,
					sessionIndex,
					sessionStart,
					(tick) => {
						sessionTicks++;
						counts.ticks++;
						scid.pushTick(tick);
						dailyAggregator.pushTickForBucket(
							tick,
							sessionStart,
							emitted.daily
						);
						seconds15Aggregator.pushTick(tick, emitted.seconds15);
						minutes5Aggregator.pushTick(tick, emitted.minutes5);
						volume500Aggregator.pushTick(tick, emitted.volume500);
						if (isInLastSessions(inputs, sessionIndex, PRICE_LEVEL_SESSIONS)) {
							priceLevelAggregator.pushTick(tick, emitted.priceLevel);
						}
					}
				);
			}

			await scid.flush();
			seconds15Ring.pushMany(emitted.seconds15);
			minutes5Ring.pushMany(emitted.minutes5);
			volume500Ring.pushMany(emitted.volume500);
			counts.seconds15 = seconds15Ring.length;
			counts.minutes5 = minutes5Ring.length;
			counts.volume500 = volume500Ring.length;
			counts.daily += emitted.daily.length;
			counts.priceLevel += emitted.priceLevel.length;
			await Promise.all([
				daily.write(emitted.daily),
				priceLevel.write(emitted.priceLevel)
			]);

			options.onSessionComplete?.({
				completed: sessionIndex + 1,
				sessionIndex,
				ticks: sessionTicks,
				total: inputs.sessionCount
			});
		}

		const final = {
			daily: dailyAggregator.finish(),
			minutes5: minutes5Aggregator.finish(),
			priceLevel: priceLevelAggregator.finish(),
			seconds15: seconds15Aggregator.finish(),
			volume500: volume500Aggregator.finish()
		};
		seconds15Ring.pushMany(final.seconds15);
		minutes5Ring.pushMany(final.minutes5);
		volume500Ring.pushMany(final.volume500);
		await Promise.all([
			priceLevel.write(final.priceLevel),
			daily.write(final.daily)
		]);
		counts.priceLevel += final.priceLevel.length;
		counts.volume500 = volume500Ring.length;
		counts.seconds15 = seconds15Ring.length;
		counts.minutes5 = minutes5Ring.length;
		counts.daily += final.daily.length;

		await Promise.all([
			writeRingBuffer(files.volume500, volume500Ring),
			writeRingBuffer(files.seconds15, seconds15Ring),
			writeRingBuffer(files.minutes5, minutes5Ring)
		]);
	} finally {
		await Promise.all([scid.close(), priceLevel.close(), daily.close()]);
	}

	return {
		counts,
		files,
		inputs
	};
}

export function getOutputFiles(inputs: GeneratorInputs): OutputFiles {
	const symbolConfig = getSymbolConfig(inputs.symbol);
	const prefix = `tradester_${symbolConfig.symbolId}`;
	const priceLevelSuffix = formatPriceLevelSuffix(symbolConfig.tickSize);

	return {
		daily: join(inputs.outputDir, `${prefix}_1d.json`),
		minutes5: join(inputs.outputDir, `${prefix}_5m.json`),
		priceLevel: join(
			inputs.outputDir,
			`${prefix}_1s_pl${priceLevelSuffix}.json`
		),
		scid: join(inputs.outputDir, `${prefix}.scid`),
		seconds15: join(inputs.outputDir, `${prefix}_15s.json`),
		volume500: join(inputs.outputDir, `${prefix}_500v.json`)
	};
}

function formatPriceLevelSuffix(tickSize: number) {
	return String(tickSize);
}

function getSessionStarts(inputs: GeneratorInputs) {
	const sessionStarts: number[] = [];
	let cursor = getSessionStart(inputs.anchorIso, 0);

	while (sessionStarts.length < inputs.sessionCount) {
		if (isTradingSessionStart(cursor)) {
			sessionStarts.push(cursor);
		}
		cursor = getPreviousSessionStart(cursor);
	}

	return sessionStarts.reverse();
}

async function writeRingBuffer(
	filePath: string,
	ringBuffer: RingBuffer<MdCandle>
) {
	const writer = new CandleJsonArrayWriter(filePath, toStoredCandle);
	await writer.open();
	try {
		await writer.write(ringBuffer.values());
	} finally {
		await writer.close();
	}
}

function isInLastSessions(
	inputs: GeneratorInputs,
	sessionIndex: number,
	sessionWindow: number
) {
	return sessionIndex >= Math.max(0, inputs.sessionCount - sessionWindow);
}

function createZeroDailyCandle(sequence: number): MdCandle {
	return {
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
