import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';
import { SIERRA_EXPORT_HEADER } from '../../sierra-sync/constants.ts';
import {
	mergeValidatedSierraExport,
	parseSierraExportRows
} from '../../sierra-sync/sierra-export.ts';
import { parseIsoToUnixMs } from '../../shared/datetime/index.ts';

const SAMPLE_TIME = parseIsoToUnixMs('2026-06-05T21:00:04.000Z');

describe('parseSierraExportRows', () => {
	it('parses OHLCV and tradester-prefixed fields', () => {
		expect(
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}, tradester_signal, ignored
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99, nope
`)
		).toEqual([
			{
				close: 1.5,
				high: 2,
				low: 0.5,
				open: 1,
				time: SAMPLE_TIME,
				tradester: { tradester_signal: '99' },
				volume: 10
			}
		]);
	});

	it('preserves Sierra fractional seconds as milliseconds', () => {
		expect(
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}
2026-06-05, 15:48:32.759001, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6
`)[0].time
		).toBe(parseIsoToUnixMs('2026-06-05T15:48:32.759Z'));
	});
});

describe('mergeValidatedSierraExport', () => {
	it('matches generated rows by timestamp when Sierra has extra boundary rows', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				`${CANDLE_ROW_HEADER}
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25
`
			);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 20:55:04.000000, 9, 9, 9, 9, 9, 1, 1, 1, 1, 9, 9, ignored
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99
`
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25,99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('writes generated columns plus tradester-prefixed Sierra fields', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				`${CANDLE_ROW_HEADER}
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25
`
			);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99
`
			);
			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25,99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('skips zero-padded generated bars during comparison', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				`${CANDLE_ROW_HEADER}
id,0,0,0,0,0,0,0,0,0
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25
`
			);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99
`
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25,99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
