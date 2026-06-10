import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateMarketData, getOutputFiles } from '../../md-generation/generate-market-data.ts';
import { normalizeInputs } from '../../md-generation/inputs.ts';
import { CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';

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
			expect(result.files.daily).toBe(join(outputRoot, 'ES', 'tradester_ES_1d.csv'));
			expect((await readFile(result.files.scid)).toString('ascii', 0, 4)).toBe('SCID');
			expect(await readFirstLine(result.files.priceLevel)).toBe(`${CANDLE_ROW_HEADER},prices`);
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
		} finally {
			await rm(firstRoot, { force: true, recursive: true });
			await rm(secondRoot, { force: true, recursive: true });
		}
	});

	it('keeps ring-buffered time outputs at latest 20,000 bars', async () => {
		const outputRoot = await mkdtemp(join(tmpdir(), 'market-data-tail-'));
		const inputs = normalizeInputs({
			outputDir: outputRoot,
			sessionCount: 80,
			symbol: 'ES',
			ticksPerSession: 300
		});

		try {
			const result = await generateMarketData(inputs);

			expect(result.counts.daily).toBe(80);
			expect(result.counts.priceLevel).toBe(9_000);
			expect(result.counts.seconds15).toBe(20_000);
			expect(result.counts.minutes5).toBe(20_000);
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
