import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../contracts/timeframes.ts';
import { generateMarketData, getOutputFiles } from '../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import {
	DEPTH_RETAINED_SESSION_COUNT,
	PRICE_LEVEL_RETAINED_SESSION_COUNT,
	RETAINED_CANDLE_BAR_COUNT
} from '../../md-generation/pipeline/pipeline-constants.ts';
import { countGeneratedTickTimeBuckets } from '../../md-generation/tick-engine/session-ticks.ts';
import { CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';
import {
	DEPTH_HEADER_SIZE,
	DEPTH_RECORD_SIZE,
	readDepthHeader
} from '../../shared/file-ops/depth.ts';

describe('generateMarketData', () => {
	it('writes all tick-first outputs for ES', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-generate-'));
		const inputs = normalizeInputs({
			outputDir: outputRoot,
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 5
		});

		try {
			const result = await generateMarketData(inputs);

			expect(result.counts.ticks).toBe(10);
			expect(result.files).toEqual(getOutputFiles(inputs));
			expect(result.files.scid).toBe(join(outputRoot, 'ES', 'tradester_ES.scid'));
			expect(result.files.metadata).toBe(join(outputRoot, 'ES', 'tradester_ES.json'));
			expect(result.files.orderbook).toBe(join(outputRoot, 'ES', 'depth'));
			expect(result.files.timeframes['1d']).toBe(join(outputRoot, 'ES', 'tradester_ES_1d.csv'));
			expect(result.files.timeframes['1s']).toBe(join(outputRoot, 'ES', 'tradester_ES_1s.csv'));
			expect(result.files.timeframes['10r']).toBe(join(outputRoot, 'ES', 'tradester_ES_10r.csv'));
			expect(result.files.timeframes['100t']).toBe(join(outputRoot, 'ES', 'tradester_ES_100t.csv'));
			expect(result.counts.orderbook).toBeGreaterThan(200);
			expect((await readFile(result.files.scid)).toString('ascii', 0, 4)).toBe('SCID');
			const depthFiles = await getDepthFiles(result.files.orderbook);
			const firstDepthFile = join(result.files.orderbook, depthFiles[0]);
			expect(depthFiles).toHaveLength(2);
			expect(depthFiles.every((fileName) => fileName.endsWith('.depth'))).toBe(true);
			expect(readDepthHeader(await readFile(firstDepthFile))).toEqual({
				fileTypeUniqueHeaderId: 'SCDD',
				headerSize: DEPTH_HEADER_SIZE,
				recordSize: DEPTH_RECORD_SIZE,
				version: 1
			});
			expect(await countDepthRecords(result.files.orderbook)).toBe(result.counts.orderbook);
			const metadata = JSON.parse(await readFile(result.files.metadata, 'utf8'));
			expect(metadata).toMatchObject({
				timeframes: {
					'100t': expect.any(Object),
					'10r': expect.any(Object),
					'15s': expect.any(Object),
					'1d': expect.objectContaining({
						endTime: expect.any(Number),
						startTime: expect.any(Number)
					}),
					'1s': expect.any(Object),
					'500v': expect.any(Object),
					'5m': expect.any(Object)
				}
			});
			expect(metadata.timeframes.daily).toBeUndefined();
			expect(metadata.timeframes.minutes5).toBeUndefined();
			expect(metadata.timeframes.priceLevel).toBeUndefined();
			expect(metadata.timeframes.range10).toBeUndefined();
			expect(metadata.timeframes.seconds15).toBeUndefined();
			expect(metadata.timeframes.tick100).toBeUndefined();
			expect(metadata.timeframes.volume500).toBeUndefined();
			expect(await readFirstLine(result.files.timeframes['1s'])).toBe(
				`${CANDLE_ROW_HEADER},prices`
			);
			expect(await readFirstLine(result.files.timeframes['10r'])).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.timeframes['100t'])).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.timeframes['500v'])).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.timeframes['15s'])).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.timeframes['5m'])).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.timeframes['1d'])).toBe(CANDLE_ROW_HEADER);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('keeps output deterministic for the same inputs', async () => {
		const firstRoot = await mkdtemp(join(tmpdir(), 'market-data-deterministic-'));
		const secondRoot = await mkdtemp(join(tmpdir(), 'market-data-deterministic-'));
		const base = {
			sessionCount: 3,
			symbol: 'ES',
			ticksPerSession: 5
		};

		try {
			const first = await generateMarketData(
				normalizeInputs({
					...base,
					outputDir: firstRoot
				})
			);
			const second = await generateMarketData(
				normalizeInputs({
					...base,
					outputDir: secondRoot
				})
			);

			expect(await readFile(second.files.scid)).toEqual(await readFile(first.files.scid));
			expect(await readFile(second.files.timeframes['1s'], 'utf8')).toBe(
				await readFile(first.files.timeframes['1s'], 'utf8')
			);
			expect(await readDepthFiles(second.files.orderbook)).toEqual(
				await readDepthFiles(first.files.orderbook)
			);
		} finally {
			await rm(firstRoot, { force: true, recursive: true });
			await rm(secondRoot, { force: true, recursive: true });
		}
	});

	it('does not carry partial volume bars across sessions', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-volume-session-'));
		const inputs = normalizeInputs({
			outputDir: outputRoot,
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 1
		});

		try {
			const result = await generateMarketData(inputs);
			const rows = (await readFile(result.files.timeframes['500v'], 'utf8'))
				.trimEnd()
				.split('\n')
				.slice(1);
			const volumes = rows.map((row) => Number(row.split(',')[7]));

			expect(rows).toHaveLength(2);
			expect(volumes.every((volume) => volume > 0 && volume < 500)).toBe(true);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('does not carry partial tick bars across sessions', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-tick-session-'));
		const inputs = normalizeInputs({
			outputDir: outputRoot,
			sessionCount: 2,
			symbol: 'ES',
			ticksPerSession: 1
		});

		try {
			const result = await generateMarketData(inputs);
			const rows = (await readFile(result.files.timeframes['100t'], 'utf8'))
				.trimEnd()
				.split('\n')
				.slice(1);

			expect(rows).toHaveLength(2);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('keeps ring-buffered time outputs at latest retained bar count', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-tail-'));
		const inputs = normalizeInputs({
			outputDir: outputRoot,
			sessionCount: 600,
			symbol: 'ES',
			ticksPerSession: 300
		});

		try {
			const result = await generateMarketData(inputs);
			const priceLevelBucketsPerSession = countGeneratedTickTimeBuckets(
				inputs.ticksPerSession,
				TIMEFRAME_DEFINITIONS['1s'].milliseconds
			);

			expect(result.counts.timeframes['1d']).toBe(600);
			expect(result.counts.timeframes['1s']).toBe(
				PRICE_LEVEL_RETAINED_SESSION_COUNT * priceLevelBucketsPerSession
			);
			expect(result.counts.timeframes['15s']).toBe(RETAINED_CANDLE_BAR_COUNT);
			expect(result.counts.timeframes['5m']).toBe(RETAINED_CANDLE_BAR_COUNT);
			expect(await getDepthFiles(result.files.orderbook)).toHaveLength(
				DEPTH_RETAINED_SESSION_COUNT
			);
			expect(await countDepthRecords(result.files.orderbook)).toBe(result.counts.orderbook);
			expect(await countRows(result.files.timeframes['15s'])).toBe(RETAINED_CANDLE_BAR_COUNT);
			expect(await countRows(result.files.timeframes['5m'])).toBe(RETAINED_CANDLE_BAR_COUNT);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('pads pre-unix daily sessions with zero candles', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-pre-unix-'));
		const inputs = normalizeInputs({
			anchorIso: '1970-01-06T23:00:00.000Z',
			outputDir: outputRoot,
			sessionCount: 10,
			symbol: 'ES',
			ticksPerSession: 5
		});

		try {
			const result = await generateMarketData(inputs);
			const daily = (await readFile(result.files.timeframes['1d'], 'utf8'))
				.trimEnd()
				.split('\n')
				.slice(1)
				.map((line) => line.split(','));
			const padded = daily.filter((candle) => candle[1] === '0' && candle[6] === '0');

			expect(daily).toHaveLength(10);
			expect(padded.length).toBeGreaterThan(0);
			expect(daily.every((candle) => !candle[0].startsWith('-'))).toBe(true);
			expect(daily.every((candle) => Number(candle[1]) >= 0)).toBe(true);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});
});

async function readFirstLine(filePath: string) {
	return (await readFile(filePath, 'utf8')).split('\n')[0];
}

async function countRows(filePath: string) {
	const text = await readFile(filePath, 'utf8');
	return text.trimEnd().split('\n').length - 1;
}

async function getDepthFiles(directory: string) {
	return (await readdir(directory)).filter((fileName) => fileName.endsWith('.depth')).sort();
}

async function countDepthRecords(directory: string) {
	let records = 0;

	for (const fileName of await getDepthFiles(directory)) {
		const file = await stat(join(directory, fileName));

		records += (file.size - DEPTH_HEADER_SIZE) / DEPTH_RECORD_SIZE;
	}

	return records;
}

async function readDepthFiles(directory: string) {
	const files: Record<string, Buffer> = {};

	for (const fileName of await getDepthFiles(directory)) {
		files[fileName] = await readFile(join(directory, fileName));
	}

	return files;
}
