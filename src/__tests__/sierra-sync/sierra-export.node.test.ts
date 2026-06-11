import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';
import { SIERRA_EXPORT_HEADER, VALIDATED_TIMEFRAMES } from '../../sierra-sync/constants.ts';
import {
	mergeValidatedSierraExports,
	mergeValidatedSierraExport,
	parseSierraExportRows
} from '../../sierra-sync/sierra-export.ts';
import { sierraExportFileName } from '../../sierra-sync/paths.ts';
import { parseIsoToUnixMs } from '../../shared/datetime/index.ts';

const SAMPLE_TIME = parseIsoToUnixMs('2026-06-05T21:00:04.000Z');
const SAMPLE_GENERATED_ROW = `id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25`;
const SAMPLE_SIERRA_TIME = '2026-06-05, 21:00:04.000000';
const SAMPLE_SIERRA_ROW = `${SAMPLE_SIERRA_TIME}, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6`;

function withGeneratedFile(line: string): string {
	return `${CANDLE_ROW_HEADER}
${line}`;
}

function withSierraFile(line: string, tradesterHeaders: string[] = []): string {
	const extras = tradesterHeaders.length === 0 ? '' : `, ${tradesterHeaders.join(', ')}`;

	return `${SIERRA_EXPORT_HEADER}${extras}
${line}`;
}

function createGeneratedFile(filePath: string) {
	return writeFile(filePath, withGeneratedFile(SAMPLE_GENERATED_ROW));
}

function createSierraFile(filePath: string) {
	return writeFile(filePath, withSierraFile(SAMPLE_SIERRA_ROW));
}

describe('parseSierraExportRows', () => {
	it('parses OHLCV and tradester-prefixed fields', () => {
		expect(
			parseSierraExportRows(
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99, nope`
			)
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
	2026-06-05, 15:48:32.759001, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6`)[0].time
		).toBe(parseIsoToUnixMs('2026-06-05T15:48:32.759Z'));
	});

	it('returns empty rows when header-only export data is provided', () => {
		expect(parseSierraExportRows(SIERRA_EXPORT_HEADER)).toEqual([]);
	});

	it('throws when the Sierra export header is unexpected', () => {
		expect(() =>
			parseSierraExportRows(`Date,Time,Open,High,Low,Last,Volume
${SAMPLE_SIERRA_ROW}`)
		).toThrow('Unexpected Sierra export header');
	});

	it('throws when Sierra export rows have missing fields', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}
2026-06-05, 21:00:04.000000, 1`)
		).toThrow('Expected at least 13 Sierra export fields');
	});

	it('throws when Sierra date parsing fails', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}
2026/06/05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 1`)
		).toThrow('Unexpected Sierra DateTime value');
	});
});

describe('mergeValidatedSierraExport', () => {
	it('matches generated rows by timestamp when Sierra has extra boundary rows', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 20:55:04.000000, 9, 9, 9, 9, 9, 1, 1, 1, 1, 9, 9, ignored
${SAMPLE_SIERRA_ROW}, 99`
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
${SAMPLE_GENERATED_ROW},99
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
			await createGeneratedFile(generated);
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, ['tradester_signal']));

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal
${SAMPLE_GENERATED_ROW},99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('keeps the generated CSV unchanged when Sierra has no tradester columns', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await createSierraFile(sierra);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER}
${SAMPLE_GENERATED_ROW}
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('collects tradester headers even when multiple fields exist', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				withSierraFile(`${SAMPLE_SIERRA_ROW}, 99, extra`, ['tradester_signal', 'tradester_note'])
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal,tradester_note
${SAMPLE_GENERATED_ROW},99,extra
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
${SAMPLE_GENERATED_ROW}`
			);
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, ['tradester_signal']));

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},tradester_signal
${SAMPLE_GENERATED_ROW},99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when generated rows are not suitable for validation', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-empty-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(generated, withGeneratedFile('id,0,0,0,0,0,0,0,0,0,0'));
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, ['tradester_signal']));

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(`Cannot validate generated file without non-padding rows: ${generated}`);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when generated file has no rows and only a header', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-empty-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(generated, CANDLE_ROW_HEADER);
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, ['tradester_signal']));

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(`Cannot validate generated file without non-padding rows: ${generated}`);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when generated headers are missing OHLCV fields', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				`${CANDLE_ROW_HEADER.replace('time,', 'bad-time,')}
id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25`
			);
			await createSierraFile(sierra);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(`Generated file is missing OHLCV columns: ${generated}`);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when no Sierra bar matches a generated timestamp', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-mismatch-ts-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				withSierraFile('2026-06-05, 21:00:05.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99', [
					'tradester_signal'
				])
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(`generated timestamp ${SAMPLE_TIME.toString()}`);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when Sierra exports contain duplicate timestamps', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-dup-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}
${SAMPLE_SIERRA_ROW}, 99
${SAMPLE_SIERRA_ROW}, 99`
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(
				`Duplicate Sierra bar in ${generated}: timestamp ${SAMPLE_TIME.toString()}`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when generated and Sierra OHLCV values disagree', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-mismatch-ohlcv-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				withSierraFile('2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.49, 10, 1, 1, 1, 1, 4, 6, 99', [
					'tradester_signal'
				])
			);

			await expect(
				mergeValidatedSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow('Sierra close mismatch');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('merges validated exports for every validated timeframe', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-all-'));
		const inputDir = root;
		const outputDir = join(root, 'out');
		const tempDir = join(root, 'temp');
		await mkdir(tempDir, { recursive: true });
		const inputFiles = {
			daily: join(inputDir, 'tradester_ES_1d.csv'),
			metadata: join(inputDir, 'tradester_ES.json'),
			minutes5: join(inputDir, 'tradester_ES_5m.csv'),
			priceLevel: join(inputDir, 'tradester_ES_1s_pl0.25.csv'),
			scid: join(inputDir, 'tradester_ES.scid'),
			seconds15: join(inputDir, 'tradester_ES_15s.csv'),
			volume500: join(inputDir, 'tradester_ES_500v.csv')
		};

		for (const file of Object.values(inputFiles)) {
			await writeFile(file, withGeneratedFile(SAMPLE_GENERATED_ROW));
		}

		for (const timeframe of VALIDATED_TIMEFRAMES) {
			await writeFile(
				join(tempDir, sierraExportFileName('/ES:XCME', timeframe.suffix)),
				withSierraFile(SAMPLE_SIERRA_ROW)
			);
		}

		try {
			await expect(
				mergeValidatedSierraExports({
					inputFiles,
					outputDir,
					symbol: '/ES:XCME',
					tempDir
				})
			).resolves.toMatchObject({});
			for (const timeframe of VALIDATED_TIMEFRAMES) {
				await expect(
					readFile(join(outputDir, inputFiles[timeframe.key].split(/[\\/]/u).at(-1) ?? ''), 'utf8')
				).resolves.toBe(`${CANDLE_ROW_HEADER}\n${SAMPLE_GENERATED_ROW}\n`);
			}
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
