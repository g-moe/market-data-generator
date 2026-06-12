import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TIMEFRAME_DEFINITIONS } from '../../contracts/timeframes.ts';
import { generateMarketData, getOutputFiles } from '../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import { countGeneratedTickTimeBuckets } from '../../md-generation/ticks.ts';
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
			expect(result.files.daily).toBe(join(outputRoot, 'ES', 'tradester_ES_1d.csv'));
			expect(result.files.orderbook).toBe(join(outputRoot, 'ES', 'depth'));
			expect(result.files.range10).toBe(join(outputRoot, 'ES', 'tradester_ES_10r.csv'));
			expect(result.files.tick100).toBe(join(outputRoot, 'ES', 'tradester_ES_100t.csv'));
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
					'1s': expect.any(Object),
					daily: expect.objectContaining({
						endTime: expect.any(Number),
						startTime: expect.any(Number)
					}),
					minutes5: expect.any(Object),
					range10: expect.any(Object),
					seconds15: expect.any(Object),
					tick100: expect.any(Object),
					volume500: expect.any(Object)
				}
			});
			expect(metadata.timeframes.priceLevel).toBeUndefined();
			expect(await readFirstLine(result.files.priceLevel)).toBe(`${CANDLE_ROW_HEADER},prices`);
			expect(await readFirstLine(result.files.range10)).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.tick100)).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.volume500)).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.seconds15)).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.minutes5)).toBe(CANDLE_ROW_HEADER);
			expect(await readFirstLine(result.files.daily)).toBe(CANDLE_ROW_HEADER);
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
			expect(await readFile(second.files.priceLevel, 'utf8')).toBe(
				await readFile(first.files.priceLevel, 'utf8')
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
			const rows = (await readFile(result.files.volume500, 'utf8')).trimEnd().split('\n').slice(1);
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
			const rows = (await readFile(result.files.tick100, 'utf8')).trimEnd().split('\n').slice(1);

			expect(rows).toHaveLength(2);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('keeps ring-buffered time outputs at latest 20,000 bars', async () => {
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

			expect(result.counts.daily).toBe(600);
			expect(result.counts.priceLevel).toBe(30 * priceLevelBucketsPerSession);
			expect(result.counts.seconds15).toBe(20_000);
			expect(result.counts.minutes5).toBe(20_000);
			expect(await getDepthFiles(result.files.orderbook)).toHaveLength(30);
			expect(await countDepthRecords(result.files.orderbook)).toBe(result.counts.orderbook);
			expect(await countRows(result.files.seconds15)).toBe(20_000);
			expect(await countRows(result.files.minutes5)).toBe(20_000);
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
			const daily = (await readFile(result.files.daily, 'utf8'))
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
