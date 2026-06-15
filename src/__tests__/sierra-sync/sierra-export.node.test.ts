import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CANDLE_ROW_HEADER } from '../../shared/file-ops/csv.ts';
import { getTimeframes } from '../../contracts/index.ts';
import { SIERRA_EXPORT_HEADER } from '../../sierra-sync/constants.ts';
import {
	mergeValidatedSierraExports,
	mergeValidatedSierraExport,
	parseSierraExportRows
} from '../../sierra-sync/sierra-export.ts';
import { sierraExportFileName } from '../../sierra-sync/paths.ts';
import { parseIsoToUnixMs } from '../../shared/datetime/index.ts';
import { getOutputFiles } from '../../shared/output-files.ts';

const SAMPLE_TIME = parseIsoToUnixMs('2026-06-05T21:00:04.000Z');
const SAMPLE_GENERATED_ROW = `id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25`;
const SAMPLE_SIERRA_TIME = '2026-06-05, 21:00:04.000000';
const SAMPLE_SIERRA_ROW = `${SAMPLE_SIERRA_TIME}, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6`;
const SAMPLE_SYMBOL = 'ES';
const SAMPLE_TIMEFRAME = '5m';
const SAMPLE_CALC_SIGNAL = 'calc__name:Signal__tf:5m__id:sma__src:close__len:20__out:value';
const SAMPLE_CALC_SIGNAL_HIST = 'calc__name:Signal__tf:5m__id:sma__src:close__len:20__out:hist';
const SAMPLE_CALC_RSI = 'calc__name:Rsi__tf:same__id:rsi__src:close__len:14__out:value';

function withGeneratedFile(line: string): string {
	return `${CANDLE_ROW_HEADER}
${line}`;
}

function withSierraFile(line: string, calcHeaders: string[] = []): string {
	const extras = calcHeaders.length === 0 ? '' : `, ${calcHeaders.join(', ')}`;

	return `${SIERRA_EXPORT_HEADER}${extras}
${line}`;
}

function createGeneratedFile(filePath: string) {
	return writeFile(filePath, withGeneratedFile(SAMPLE_GENERATED_ROW));
}

function createSierraFile(filePath: string) {
	return writeFile(filePath, withSierraFile(SAMPLE_SIERRA_ROW));
}

function mergeSampleSierraExport({
	exportFile,
	inputFile,
	outputFile
}: {
	exportFile: string;
	inputFile: string;
	outputFile: string;
}) {
	return mergeValidatedSierraExport({
		exportFile,
		inputFile,
		outputFile,
		symbol: SAMPLE_SYMBOL,
		timeframe: SAMPLE_TIMEFRAME
	});
}

function calculationsJsonFile(outputFile: string) {
	return outputFile.replace(/\.csv$/u, '.json');
}

async function readJson(filePath: string) {
	return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

describe('parseSierraExportRows', () => {
	it('parses OHLCV and calc-prefixed fields', () => {
		expect(
			parseSierraExportRows(
				`${SIERRA_EXPORT_HEADER}, ${SAMPLE_CALC_SIGNAL}, ignored_extra
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99, nope`
			)
		).toEqual([
			{
				calc: { [SAMPLE_CALC_SIGNAL]: '99' },
				close: 1.5,
				high: 2,
				low: 0.5,
				open: 1,
				time: SAMPLE_TIME,
				volume: 10
			}
		]);
	});

	it('ignores legacy tradester-prefixed fields', () => {
		expect(
			parseSierraExportRows(
				`${SIERRA_EXPORT_HEADER}, tradester_signal
2026-06-05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 99`
			)[0].calc
		).toEqual({});
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

	it('validates calc headers even when header-only export data is provided', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}, calc__name:Signal__tf:5m__id:sma`)
		).toThrow('Invalid calc column');
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

	it('throws when calc headers do not match the output format', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}, calc__name:Bad-Name__tf:5m__id:sma__out:value
${SAMPLE_SIERRA_ROW}, 99`)
		).toThrow('Invalid calc column');
	});

	it('throws when calc headers repeat singleton keys', () => {
		const cases = [
			{
				header: 'calc__name:Signal__tf:5m__id:sma__src:close__out:value__name:Other',
				message: 'duplicate name segment'
			},
			{
				header: 'calc__name:Signal__tf:5m__id:sma__src:close__out:value__id:ema',
				message: 'duplicate id segment'
			},
			{
				header: 'calc__name:Signal__tf:5m__id:sma__src:close__out:value__out:hist',
				message: 'duplicate out segment'
			}
		];

		for (const testCase of cases) {
			expect(() =>
				parseSierraExportRows(`${SIERRA_EXPORT_HEADER}, ${testCase.header}
${SAMPLE_SIERRA_ROW}, 99`)
			).toThrow(testCase.message);
		}
	});

	it('throws when calc fields are missing from Sierra rows', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}, ${SAMPLE_CALC_SIGNAL}
${SAMPLE_SIERRA_ROW}`)
		).toThrow(`Missing Sierra calc field "${SAMPLE_CALC_SIGNAL}"`);
	});

	it('throws when Sierra date parsing fails', () => {
		expect(() =>
			parseSierraExportRows(`${SIERRA_EXPORT_HEADER}
2026/06/05, 21:00:04.000000, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6, 1`)
		).toThrow('Unexpected Sierra DateTime value');
	});
});

describe('mergeValidatedSierraExport', () => {
	it('ignores Sierra boundary rows before the generated start', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}, ${SAMPLE_CALC_SIGNAL}
2026-06-05, 20:55:04.000000, 9, 9, 9, 9, 9, 1, 1, 1, 1, 9, 9, ignored
${SAMPLE_SIERRA_ROW}, 99`
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},${SAMPLE_CALC_SIGNAL}
${SAMPLE_GENERATED_ROW},99
`
			);
			await expect(readJson(calculationsJsonFile(output))).resolves.toEqual({
				indicators: [
					{
						id: 'sma',
						inputs: {
							len: '20',
							src: 'close',
							tf: '5m'
						},
						name: 'Signal',
						outputKeys: ['value']
					}
				],
				symbol: SAMPLE_SYMBOL,
				timeframe: SAMPLE_TIMEFRAME
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when Sierra inserts an unmatched row after the generated start', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-inserted-row-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				withGeneratedFile(`${SAMPLE_GENERATED_ROW}
id2,${(SAMPLE_TIME + 1000).toString()},1,1.5,2.5,1,2,20,9,11,1.75`)
			);
			await writeFile(
				sierra,
				`${SIERRA_EXPORT_HEADER}
${SAMPLE_SIERRA_ROW}
2026-06-05, 21:00:04.500000, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0
2026-06-05, 21:00:05.000000, 1.5, 2.5, 1, 2, 20, 1, 1, 1, 1, 9, 11`
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow('Sierra timestamp mismatch');
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('matches duplicate Sierra millisecond timestamps in export order', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-duplicate-ms-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await writeFile(
				generated,
				withGeneratedFile(`id,${SAMPLE_TIME.toString()},0,1,2,0.5,1.5,10,4,6,1.25
id2,${SAMPLE_TIME.toString()},1,1.5,2.5,1,2,10,5,5,1.75`)
			);
			await writeFile(
				sierra,
				withSierraFile(`2026-06-05, 21:00:04.000001, 1, 2, 0.5, 1.5, 10, 1, 1, 1, 1, 4, 6
2026-06-05, 21:00:04.000002, 1.5, 2.5, 1, 2, 10, 1, 1, 1, 1, 5, 5`)
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 2, outputFile: output });
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('writes generated columns plus calc-prefixed Sierra fields', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, [SAMPLE_CALC_SIGNAL]));

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},${SAMPLE_CALC_SIGNAL}
${SAMPLE_GENERATED_ROW},99
`
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('keeps the generated CSV unchanged when Sierra has no calc columns', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await createSierraFile(sierra);

			await expect(
				mergeSampleSierraExport({
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
			await expect(readJson(calculationsJsonFile(output))).resolves.toEqual({
				indicators: [],
				symbol: SAMPLE_SYMBOL,
				timeframe: SAMPLE_TIMEFRAME
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('collects calc headers even when multiple fields exist', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				withSierraFile(`${SAMPLE_SIERRA_ROW}, 99, 45, 55`, [
					SAMPLE_CALC_SIGNAL,
					SAMPLE_CALC_SIGNAL_HIST,
					SAMPLE_CALC_RSI
				])
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},${SAMPLE_CALC_SIGNAL},${SAMPLE_CALC_SIGNAL_HIST},${SAMPLE_CALC_RSI}
${SAMPLE_GENERATED_ROW},99,45,55
`
			);
			await expect(readJson(calculationsJsonFile(output))).resolves.toEqual({
				indicators: [
					{
						id: 'sma',
						inputs: {
							len: '20',
							src: 'close',
							tf: '5m'
						},
						name: 'Signal',
						outputKeys: ['value', 'hist']
					},
					{
						id: 'rsi',
						inputs: {
							len: '14',
							src: 'close',
							tf: 'same'
						},
						name: 'Rsi',
						outputKeys: ['value']
					}
				],
				symbol: SAMPLE_SYMBOL,
				timeframe: SAMPLE_TIMEFRAME
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('throws when Sierra calc columns duplicate an output key for one indicator', async () => {
		const root = await mkdtemp(join(tmpdir(), 'sierra-export-duplicate-calc-output-'));
		const generated = join(root, 'generated.csv');
		const sierra = join(root, 'sierra.txt');
		const output = join(root, 'output.csv');

		try {
			await createGeneratedFile(generated);
			await writeFile(
				sierra,
				withSierraFile(`${SAMPLE_SIERRA_ROW}, 99, 45`, [SAMPLE_CALC_SIGNAL, SAMPLE_CALC_SIGNAL])
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow('Duplicate calc output key "value" for indicator "Signal"');
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
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, [SAMPLE_CALC_SIGNAL]));

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
			await expect(readFile(output, 'utf8')).resolves.toBe(
				`${CANDLE_ROW_HEADER},${SAMPLE_CALC_SIGNAL}
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
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, [SAMPLE_CALC_SIGNAL]));

			await expect(
				mergeSampleSierraExport({
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
			await writeFile(sierra, withSierraFile(`${SAMPLE_SIERRA_ROW}, 99`, [SAMPLE_CALC_SIGNAL]));

			await expect(
				mergeSampleSierraExport({
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
				mergeSampleSierraExport({
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
					SAMPLE_CALC_SIGNAL
				])
			);

			await expect(
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).rejects.toThrow(`generated timestamp ${SAMPLE_TIME.toString()}`);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('allows unused duplicate Sierra timestamps after generated rows match', async () => {
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
				mergeSampleSierraExport({
					exportFile: sierra,
					inputFile: generated,
					outputFile: output
				})
			).resolves.toMatchObject({ comparedRows: 1, outputFile: output });
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
					SAMPLE_CALC_SIGNAL
				])
			);

			await expect(
				mergeSampleSierraExport({
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
		const inputFiles = getOutputFiles('/ES:XCME', inputDir);

		for (const file of Object.values(inputFiles.timeframes)) {
			await writeFile(file, withGeneratedFile(SAMPLE_GENERATED_ROW));
		}

		for (const timeframe of getTimeframes('/ES:XCME')) {
			await writeFile(
				join(tempDir, sierraExportFileName('/ES:XCME', timeframe)),
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
			for (const timeframe of getTimeframes('/ES:XCME')) {
				const inputFile = inputFiles.timeframes[timeframe.key];
				const outputFile = join(outputDir, inputFile.split(/[\\/]/u).at(-1) ?? '');

				await expect(readFile(outputFile, 'utf8')).resolves.toBe(
					`${CANDLE_ROW_HEADER}\n${SAMPLE_GENERATED_ROW}\n`
				);
				await expect(readJson(calculationsJsonFile(outputFile))).resolves.toEqual({
					indicators: [],
					symbol: 'ES',
					timeframe: timeframe.suffix
				});
			}
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
