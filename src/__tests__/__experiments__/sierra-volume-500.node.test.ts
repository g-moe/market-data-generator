import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { VOLUME_BAR_SIZE } from '../../contracts/defaults.ts';
import type { MdCandle, TradeSide } from '../../contracts/types.ts';
import { createBarId } from '../../md-generation/candles.ts';
import { parseCandleRowsFast } from '../../shared/file-ops/csv.ts';
import { SCID_EPOCH_OFFSET_MS } from '../../shared/file-ops/scid.ts';
import { parseSierraExportRows } from '../../sierra-sync/sierra-export.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const ES_SCID = join(ROOT, 'data-in', 'ES', 'tradester_ES.scid');
const ES_GENERATED_500V = join(ROOT, 'data-in', 'ES', 'tradester_ES_500v.csv');
const ES_SIERRA_500V = join(ROOT, 'data-out-temp', 'ES', 'tradester_ES_500v_GraphData.txt');

const SCID_HEADER_BYTES = 56;
const SCID_RECORD_BYTES = 40;
const SCID_CHUNK_RECORDS = 65_536;
const MAX_EXPERIMENT_TICKS = 1_000_000;
const UINT32_SIZE = 0x1_0000_0000;

type Tick = {
	time: number;
	price: number;
	volume: number;
	side: TradeSide;
};

type CandidateResult = {
	name: string;
	rows: MdCandle[];
	score: MatchScore;
};

type MatchScore = {
	compared: number;
	exact: number;
	firstMismatch: string | undefined;
};

describe('experiment: Sierra 500-volume tick aggregation', () => {
	it('compares isolated 500-volume candidates against local generated and Sierra exports', async () => {
		const generated = parseCandleRowsFast(await readFile(ES_GENERATED_500V, 'utf8'));
		const sierra = parseSierraExportRows(await readFile(ES_SIERRA_500V, 'utf8'));
		const ticks = await readScidTicksFromTime(ES_SCID, sierra[0].time);
		const candidates = rankCandidates(ticks, sierra);

		expect(ticks.length).toBeGreaterThan(0);
		expect(generated.length).toBeGreaterThan(0);
		expect(sierra.length).toBeGreaterThan(0);

		console.info(formatCandidateScores(candidates));
		expect(Math.abs(ticks[0].time - sierra[0].time)).toBeLessThan(60_000);
		expect(candidates[0]).toMatchObject({
			name: 'split ticks at exact target volume',
			score: {
				exact: 100
			}
		});
	});
});

function rankCandidates(
	ticks: Tick[],
	target: Array<Pick<MdCandle, 'close' | 'high' | 'low' | 'open' | 'time' | 'volume'>>
) {
	return [
		{
			name: 'split ticks at exact target volume',
			rows: aggregateSplitTicks(ticks)
		},
		{
			name: 'close before overshoot, carry whole tick',
			rows: aggregateWholeTicksNoOvershoot(ticks)
		},
		{
			name: 'include overshoot in current bar',
			rows: aggregateWholeTicksWithOvershoot(ticks)
		}
	]
		.map(
			(candidate): CandidateResult => ({
				...candidate,
				score: compareRows(candidate.rows, target, 100)
			})
		)
		.sort((left, right) => right.score.exact - left.score.exact);
}

function aggregateSplitTicks(ticks: Tick[]) {
	return aggregateTicks(ticks, 'split');
}

function aggregateWholeTicksNoOvershoot(ticks: Tick[]) {
	return aggregateTicks(ticks, 'whole-no-overshoot');
}

function aggregateWholeTicksWithOvershoot(ticks: Tick[]) {
	return aggregateTicks(ticks, 'whole-with-overshoot');
}

function aggregateTicks(
	ticks: Tick[],
	mode: 'split' | 'whole-no-overshoot' | 'whole-with-overshoot'
) {
	const rows: MdCandle[] = [];
	let current: MutableCandle | undefined;

	for (const tick of ticks) {
		if (mode === 'split') {
			current = pushSplitTick(current, rows, tick);
			continue;
		}

		current = pushWholeTick(current, rows, tick, mode);
	}

	if (current !== undefined) rows.push(finalize(current, rows.length));

	return rows;
}

type MutableCandle = {
	askVolume: number;
	bidVolume: number;
	close: number;
	high: number;
	low: number;
	open: number;
	priceVolume: number;
	time: number;
	volume: number;
};

function pushSplitTick(current: MutableCandle | undefined, rows: MdCandle[], tick: Tick) {
	let next = current;
	let remaining = tick.volume;

	while (remaining > 0) {
		const volume = Math.min(remaining, VOLUME_BAR_SIZE - (next?.volume ?? 0));
		next = addVolume(next, tick, volume);
		remaining -= volume;

		if (next.volume === VOLUME_BAR_SIZE) {
			rows.push(finalize(next, rows.length));
			next = undefined;
		}
	}

	return next;
}

function pushWholeTick(
	current: MutableCandle | undefined,
	rows: MdCandle[],
	tick: Tick,
	mode: 'whole-no-overshoot' | 'whole-with-overshoot'
) {
	if (
		current !== undefined &&
		mode === 'whole-no-overshoot' &&
		current.volume + tick.volume > VOLUME_BAR_SIZE
	) {
		rows.push(finalize(current, rows.length));
		current = undefined;
	}

	const next = addVolume(current, tick, tick.volume);
	if (next.volume >= VOLUME_BAR_SIZE) {
		rows.push(finalize(next, rows.length));
		return undefined;
	}

	return next;
}

function addVolume(current: MutableCandle | undefined, tick: Tick, volume: number): MutableCandle {
	const askVolume = tick.side === 'ask' ? volume : 0;
	const bidVolume = tick.side === 'bid' ? volume : 0;

	if (current === undefined) {
		return {
			askVolume,
			bidVolume,
			close: tick.price,
			high: tick.price,
			low: tick.price,
			open: tick.price,
			priceVolume: tick.price * volume,
			time: tick.time,
			volume
		};
	}

	current.askVolume += askVolume;
	current.bidVolume += bidVolume;
	current.close = tick.price;
	current.high = Math.max(current.high, tick.price);
	current.low = Math.min(current.low, tick.price);
	current.priceVolume += tick.price * volume;
	current.volume += volume;

	return current;
}

function finalize(candle: MutableCandle, pos: number): MdCandle {
	return {
		askVolume: candle.askVolume,
		bidVolume: candle.bidVolume,
		close: candle.close,
		high: candle.high,
		id: createBarId(candle.time, 0),
		low: candle.low,
		open: candle.open,
		pos,
		time: candle.time,
		volume: candle.volume,
		vwap: candle.priceVolume / candle.volume
	};
}

async function readScidTicksFromTime(filePath: string, startTime: number) {
	const ticks: Tick[] = [];
	const handle = await open(filePath, 'r');

	try {
		const stats = await handle.stat();
		const totalRecords = (stats.size - SCID_HEADER_BYTES) / SCID_RECORD_BYTES;
		const startRecord = await findFirstRecordAtOrAfter(handle, totalRecords, startTime);
		const recordCount = Math.min(totalRecords - startRecord, MAX_EXPERIMENT_TICKS);
		const chunk = Buffer.alloc(SCID_CHUNK_RECORDS * SCID_RECORD_BYTES);
		let cursor = 0;

		while (cursor < recordCount) {
			const recordsToRead = Math.min(SCID_CHUNK_RECORDS, recordCount - cursor);
			const bytesToRead = recordsToRead * SCID_RECORD_BYTES;
			await handle.read(
				chunk,
				0,
				bytesToRead,
				SCID_HEADER_BYTES + (startRecord + cursor) * SCID_RECORD_BYTES
			);

			for (let index = 0; index < recordsToRead; index++) {
				const offset = index * SCID_RECORD_BYTES;
				const low = chunk.readUInt32LE(offset);
				const high = chunk.readInt32LE(offset + 4);
				const scDateTimeMicroseconds = high * UINT32_SIZE + low;
				const time = SCID_EPOCH_OFFSET_MS + Math.floor(scDateTimeMicroseconds / 1000);
				const volume = chunk.readUInt32LE(offset + 28);
				const bidVolume = chunk.readUInt32LE(offset + 32);
				const askVolume = chunk.readUInt32LE(offset + 36);

				ticks.push({
					price: chunk.readFloatLE(offset + 20),
					side: askVolume >= bidVolume ? 'ask' : 'bid',
					time,
					volume
				});
			}

			cursor += recordsToRead;
		}
	} finally {
		await handle.close();
	}

	return ticks;
}

async function findFirstRecordAtOrAfter(
	handle: Awaited<ReturnType<typeof open>>,
	recordCount: number,
	time: number
) {
	let left = 0;
	let right = recordCount;
	const buffer = Buffer.alloc(SCID_RECORD_BYTES);

	while (left < right) {
		const middle = Math.floor((left + right) / 2);
		await handle.read(buffer, 0, SCID_RECORD_BYTES, SCID_HEADER_BYTES + middle * SCID_RECORD_BYTES);
		const recordTime = readScidTime(buffer, 0);

		if (recordTime < time) {
			left = middle + 1;
			continue;
		}

		right = middle;
	}

	return left;
}

function readScidTime(buffer: Buffer, offset: number) {
	const low = buffer.readUInt32LE(offset);
	const high = buffer.readInt32LE(offset + 4);
	const scDateTimeMicroseconds = high * UINT32_SIZE + low;

	return SCID_EPOCH_OFFSET_MS + Math.floor(scDateTimeMicroseconds / 1000);
}

function compareRows(
	actual: Array<Pick<MdCandle, 'close' | 'high' | 'low' | 'open' | 'time' | 'volume'>>,
	expected: Array<Pick<MdCandle, 'close' | 'high' | 'low' | 'open' | 'time' | 'volume'>>,
	limit: number
): MatchScore {
	const compared = Math.min(actual.length, expected.length, limit);
	let exact = 0;
	let firstMismatch: string | undefined;

	for (let index = 0; index < compared; index++) {
		const left = actual[index];
		const right = expected[index];
		const matches =
			left.time === right.time &&
			left.open === right.open &&
			left.high === right.high &&
			left.low === right.low &&
			left.close === right.close &&
			left.volume === right.volume;

		if (matches) {
			exact++;
			continue;
		}

		firstMismatch ??= `row ${index.toString()}: actual ${formatRow(left)} expected ${formatRow(right)}`;
	}

	return { compared, exact, firstMismatch };
}

function formatCandidateScores(candidates: CandidateResult[]) {
	return candidates
		.map(
			(candidate) =>
				`${candidate.name}: ${candidate.score.exact.toString()}/${candidate.score.compared.toString()} ${candidate.score.firstMismatch ?? ''}`
		)
		.join('\n');
}

function formatRow(row: Pick<MdCandle, 'close' | 'high' | 'low' | 'open' | 'time' | 'volume'>) {
	return JSON.stringify({
		close: row.close,
		high: row.high,
		low: row.low,
		open: row.open,
		time: row.time,
		volume: row.volume
	});
}
