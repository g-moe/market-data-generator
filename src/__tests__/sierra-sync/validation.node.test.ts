import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRICE_LEVEL_CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';
import { SIERRA_GRAPH_DATA_HEADER } from '../../sierra-sync/constants.ts';
import {
	parseSierraGraphDataRows,
	validateSierraOneSecondBars
} from '../../sierra-sync/validation.ts';

describe('parseSierraGraphDataRows', () => {
	it('parses Sierra GraphData timestamps and OHLCV values', () => {
		expect(
			parseSierraGraphDataRows(
				`${SIERRA_GRAPH_DATA_HEADER}, tradester_sma100\n2026-6-5, 21:00:00.000000, 4330, 4331, 4329.75, 4330.25, 12, 1, 4330, 4330, 4330, 5, 7, 4330.25\n`
			)
		).toEqual([
			{
				high: 4331,
				last: 4330.25,
				low: 4329.75,
				open: 4330,
				time: Date.UTC(2026, 5, 6, 2, 0, 0),
				volume: 12
			}
		]);
	});
});

describe('validateSierraOneSecondBars', () => {
	it('aligns at the first generated timestamp and compares rows in order', async () => {
		await withFiles(
			generatedRows([
				row(Date.UTC(2026, 5, 6, 2, 0, 4), 4330, 4331, 4329, 4330.5, 12),
				row(Date.UTC(2026, 5, 6, 2, 0, 5), 4330.5, 4332, 4330.25, 4331, 9)
			]),
			sierraRows([
				sierraRow('2026-06-05', '21:00:03', 1, 1, 1, 1, 1),
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.5, 12),
				sierraRow('2026-06-05', '21:00:05', 4330.5, 4332, 4330.25, 4331, 9)
			]),
			async ({ generatedFilePath, sierraFilePath }) => {
				await expect(
					validateSierraOneSecondBars({ generatedFilePath, sierraFilePath })
				).resolves.toEqual({
					comparedRows: 2,
					firstMatchedTimestamp: Date.UTC(2026, 5, 6, 2, 0, 4),
					generatedFilePath,
					lastMatchedTimestamp: Date.UTC(2026, 5, 6, 2, 0, 5),
					sierraFilePath,
					skippedSierraRows: 1
				});
			}
		);
	});

	it('fails when Sierra does not contain the first generated timestamp', async () => {
		await expectValidationError({
			generated: generatedRows([
				row(Date.UTC(2026, 5, 6, 2, 0, 4), 4330, 4331, 4329, 4330.5, 12)
			]),
			message: 'does not contain generated start timestamp',
			sierra: sierraRows([
				sierraRow('2026-06-05', '21:00:03', 4330, 4331, 4329, 4330.5, 12)
			])
		});
	});

	it('fails when timestamps drift after comparison starts', async () => {
		await expectValidationError({
			generated: generatedRows([
				row(Date.UTC(2026, 5, 6, 2, 0, 4), 4330, 4331, 4329, 4330.5, 12),
				row(Date.UTC(2026, 5, 6, 2, 0, 5), 4330.5, 4332, 4330.25, 4331, 9)
			]),
			message: 'timestamp mismatch',
			sierra: sierraRows([
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.5, 12),
				sierraRow('2026-06-05', '21:00:06', 4330.5, 4332, 4330.25, 4331, 9)
			])
		});
	});

	it('fails on the first OHLCV mismatch', async () => {
		await expectValidationError({
			generated: generatedRows([
				row(Date.UTC(2026, 5, 6, 2, 0, 4), 4330, 4331, 4329, 4330.5, 12)
			]),
			message: 'close mismatch',
			sierra: sierraRows([
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.75, 12)
			])
		});
	});

	it('fails when Sierra runs out of rows after comparison starts', async () => {
		await expectValidationError({
			generated: generatedRows([
				row(Date.UTC(2026, 5, 6, 2, 0, 4), 4330, 4331, 4329, 4330.5, 12),
				row(Date.UTC(2026, 5, 6, 2, 0, 5), 4330.5, 4332, 4330.25, 4331, 9)
			]),
			message: 'ended after 1 compared rows',
			sierra: sierraRows([
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.5, 12)
			])
		});
	});
});

async function expectValidationError({
	generated,
	message,
	sierra
}: {
	generated: string;
	message: string;
	sierra: string;
}) {
	await withFiles(
		generated,
		sierra,
		async ({ generatedFilePath, sierraFilePath }) => {
			await expect(
				validateSierraOneSecondBars({ generatedFilePath, sierraFilePath })
			).rejects.toThrow(message);
		}
	);
}

async function withFiles(
	generated: string,
	sierra: string,
	callback: (paths: {
		generatedFilePath: string;
		sierraFilePath: string;
	}) => Promise<void>
) {
	const root = await mkdtemp(join(tmpdir(), 'sierra-validation-'));
	const generatedFilePath = join(root, 'generated.csv');
	const sierraFilePath = join(root, 'sierra.txt');

	try {
		await Promise.all([
			writeFile(generatedFilePath, generated),
			writeFile(sierraFilePath, sierra)
		]);
		await callback({ generatedFilePath, sierraFilePath });
	} finally {
		await rm(root, { force: true, recursive: true });
	}
}

function generatedRows(rows: string[]) {
	return `${PRICE_LEVEL_CANDLE_ROW_HEADER}\n${rows.join('\n')}\n`;
}

function row(
	time: number,
	open: number,
	high: number,
	low: number,
	close: number,
	volume: number
) {
	return `${time.toString()}000000,${time.toString()},0,${open.toString()},${high.toString()},${low.toString()},${close.toString()},${volume.toString()},${volume.toString()},0,${close.toString()},${close.toString()}:${volume.toString()}`;
}

function sierraRows(rows: string[]) {
	return `${SIERRA_GRAPH_DATA_HEADER}\n${rows.join('\n')}\n`;
}

function sierraRow(
	date: string,
	time: string,
	open: number,
	high: number,
	low: number,
	last: number,
	volume: number
) {
	return `${date}, ${time}.000000, ${open.toString()}, ${high.toString()}, ${low.toString()}, ${last.toString()}, ${volume.toString()}, 1, ${last.toString()}, ${last.toString()}, ${last.toString()}, 0, ${volume.toString()}`;
}

describe('validateSierraOneSecondBars edge cases', () => {
	it('accepts generated candle rows without price levels', async () => {
		await withFiles(
			`id,time,pos,open,high,low,close,volume,bidVolume,askVolume,vwap\n${row(
				Date.UTC(2026, 5, 6, 2, 0, 4),
				4330,
				4331,
				4329,
				4330.5,
				12
			)
				.split(',')
				.slice(0, 11)
				.join(',')}\n`,
			sierraRows([
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.5, 12)
			]),
			async ({ generatedFilePath, sierraFilePath }) => {
				await expect(
					validateSierraOneSecondBars({ generatedFilePath, sierraFilePath })
				).resolves.toMatchObject({ comparedRows: 1 });
			}
		);
	});

	it('fails on an empty generated file', async () => {
		await withFiles(
			`${PRICE_LEVEL_CANDLE_ROW_HEADER}\n`,
			sierraRows([
				sierraRow('2026-06-05', '21:00:04', 4330, 4331, 4329, 4330.5, 12)
			]),
			async ({ generatedFilePath, sierraFilePath }) => {
				await expect(
					validateSierraOneSecondBars({ generatedFilePath, sierraFilePath })
				).rejects.toThrow('Cannot validate empty generated 1-second file');
			}
		);
	});

	it('fails on unexpected generated and Sierra headers', async () => {
		await withFiles(
			'bad\n',
			sierraRows([]),
			async ({ generatedFilePath, sierraFilePath }) => {
				await expect(
					validateSierraOneSecondBars({ generatedFilePath, sierraFilePath })
				).rejects.toThrow('Unexpected generated 1-second row header');
			}
		);
		expect(() => parseSierraGraphDataRows('bad\nrow\n')).toThrow(
			'Unexpected Sierra GraphData header'
		);
	});

	it('fails on malformed Sierra rows', () => {
		expect(() =>
			parseSierraGraphDataRows(
				`${SIERRA_GRAPH_DATA_HEADER}\n2026-06-05, 21:00:04.000000, 4330\n`
			)
		).toThrow('Expected at least 13 Sierra GraphData fields');
		expect(() =>
			parseSierraGraphDataRows(
				`${SIERRA_GRAPH_DATA_HEADER}\nnot-a-date, 21:00:04.000000, 4330, 4331, 4329, 4330.5, 12, 1, 4330, 4330, 4330, 0, 12\n`
			)
		).toThrow('Unexpected Sierra DateTime value');
	});
});
