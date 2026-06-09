import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	generateMarketData,
	getOutputFiles
} from '../../domain/generate-market-data.ts';
import { normalizeInputs } from '../../domain/inputs.ts';

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
			expect(result.files.scid).toBe(
				join(outputRoot, 'ES', 'tradester_ES.scid')
			);
			expect((await readFile(result.files.scid)).toString('ascii', 0, 4)).toBe(
				'SCID'
			);
			expect(
				JSON.parse(await readFile(result.files.priceLevel, 'utf8'))
			).toBeInstanceOf(Array);
			expect(
				JSON.parse(await readFile(result.files.volume500, 'utf8'))
			).toBeInstanceOf(Array);
			expect(
				JSON.parse(await readFile(result.files.seconds15, 'utf8'))
			).toBeInstanceOf(Array);
			expect(
				JSON.parse(await readFile(result.files.minutes5, 'utf8'))
			).toBeInstanceOf(Array);
			expect(
				JSON.parse(await readFile(result.files.daily, 'utf8'))
			).toBeInstanceOf(Array);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});

	it('keeps output deterministic for the same inputs', async () => {
		const firstRoot = await mkdtemp(
			join(tmpdir(), 'market-data-deterministic-')
		);
		const secondRoot = await mkdtemp(
			join(tmpdir(), 'market-data-deterministic-')
		);
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

			expect(await readFile(second.files.scid)).toEqual(
				await readFile(first.files.scid)
			);
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
			expect(
				JSON.parse(await readFile(result.files.seconds15, 'utf8'))
			).toHaveLength(20_000);
			expect(
				JSON.parse(await readFile(result.files.minutes5, 'utf8'))
			).toHaveLength(20_000);
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
			const daily = JSON.parse(await readFile(result.files.daily, 'utf8'));
			const padded = daily.filter(
				(candle: { close: number; time: number }) =>
					candle.time === 0 && candle.close === 0
			);

			expect(daily).toHaveLength(10);
			expect(padded.length).toBeGreaterThan(0);
			expect(
				daily.every((candle: { id: string }) => !candle.id.startsWith('-'))
			).toBe(true);
			expect(daily.every((candle: { time: number }) => candle.time >= 0)).toBe(
				true
			);
		} finally {
			await rm(outputRoot, { force: true, recursive: true });
		}
	});
});
