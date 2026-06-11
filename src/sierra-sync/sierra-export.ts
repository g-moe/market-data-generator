import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { CANDLE_ROW_HEADER } from '../shared/file-ops/csv.ts';
import { utcDateTimeToUnixMs } from '../shared/datetime/index.ts';
import { SIERRA_EXPORT_HEADER, VALIDATED_TIMEFRAMES } from './constants.ts';
import { sierraExportFileName } from './paths.ts';

type GeneratedRow = {
	close: number;
	high: number;
	low: number;
	open: number;
	raw: string;
	time: number;
	volume: number;
};

export type SierraExportRow = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	tradester: Record<string, string>;
};

export async function mergeValidatedSierraExports({
	inputFiles,
	outputDir,
	symbol,
	tempDir
}: {
	inputFiles: OutputFiles;
	outputDir: string;
	symbol: Symbol;
	tempDir: string;
}) {
	await mkdir(outputDir, { recursive: true });

	for (const timeframe of VALIDATED_TIMEFRAMES) {
		const inputFile = inputFiles[timeframe.key];
		await mergeValidatedSierraExport({
			exportFile: join(tempDir, sierraExportFileName(symbol, timeframe.suffix)),
			inputFile,
			outputFile: join(outputDir, inputFile.split(/[\\/]/u).at(-1) ?? inputFile)
		});
	}
}

export async function mergeValidatedSierraExport({
	exportFile,
	inputFile,
	outputFile
}: {
	exportFile: string;
	inputFile: string;
	outputFile: string;
}) {
	const [generatedText, sierraText] = await Promise.all([
		readFile(inputFile, 'utf8'),
		readFile(exportFile, 'utf8')
	]);
	const generated = parseGeneratedCsv(generatedText, inputFile);
	const sierra = parseSierraExportRows(sierraText);
	const comparableRows = generated.rows.filter((row) => !isGeneratedPaddingRow(row));

	if (comparableRows.length === 0)
		throw new Error(`Cannot validate generated file without non-padding rows: ${inputFile}`);

	const tradesterHeaders = Object.keys(
		sierra.find((row) => Object.keys(row.tradester).length > 0)?.tradester ?? {}
	);
	const hasTradesterColumns = tradesterHeaders.length > 0;
	const sierraByTime = indexSierraRowsByTime(sierra, inputFile);
	const outputRows = [buildMergedHeader(generated.header, tradesterHeaders)];

	for (let i = 0; i < comparableRows.length; i++) {
		const generatedRow = comparableRows[i];
		const sierraRow = sierraByTime.get(generatedRow.time);
		if (sierraRow === undefined)
			throw new Error(
				`Missing Sierra bar in ${inputFile} at row ${i.toString()}: generated timestamp ${generatedRow.time.toString()}`
			);

		compareGeneratedToSierra(generatedRow, sierraRow, i, inputFile);
		outputRows.push(buildMergedRow(generatedRow.raw, sierraRow.tradester, tradesterHeaders, hasTradesterColumns));
	}
	await mkdir(dirname(outputFile), { recursive: true });
	await writeFile(outputFile, `${outputRows.join('\n')}\n`);

	return { comparedRows: comparableRows.length, outputFile };
}

export function parseSierraExportRows(text: string): SierraExportRow[] {
	const lines = text.trimEnd().split(/\r?\n/u);
	if (lines.length <= 1) return [];

	const headers = lines[0].split(',').map((field) => field.trim());
	if (headers.slice(0, 13).join(', ') !== SIERRA_EXPORT_HEADER)
		throw new Error('Unexpected Sierra export header');

	return lines
		.slice(1)
		.filter(Boolean)
		.map((line) => parseSierraExportRow(line, headers));
}

function parseGeneratedCsv(text: string, filePath: string) {
	const lines = text.trimEnd().split(/\r?\n/u);
	if (lines.length <= 1)
		return {
			header: lines[0] ?? CANDLE_ROW_HEADER,
			rows: [] as GeneratedRow[]
		};

	const headers = lines[0].split(',');
	const indexes = {
		close: headers.indexOf('close'),
		high: headers.indexOf('high'),
		low: headers.indexOf('low'),
		open: headers.indexOf('open'),
		time: headers.indexOf('time'),
		volume: headers.indexOf('volume')
	};
	if (Object.values(indexes).some((index) => index === -1))
		throw new Error(`Generated file is missing OHLCV columns: ${filePath}`);

	return {
		header: lines[0],
		rows: lines
			.slice(1)
			.filter(Boolean)
			.map((line) => {
				const fields = line.split(',');

				return {
					close: Number(fields[indexes.close]),
					high: Number(fields[indexes.high]),
					low: Number(fields[indexes.low]),
					open: Number(fields[indexes.open]),
					raw: line,
					time: Number(fields[indexes.time]),
					volume: Number(fields[indexes.volume])
				};
			})
	};
}

function buildMergedHeader(generatedHeader: string, tradesterHeaders: string[]) {
	if (tradesterHeaders.length === 0) return generatedHeader;

	return `${generatedHeader},${tradesterHeaders.join(',')}`;
}

function buildMergedRow(
	generatedRow: string,
	tradester: Record<string, string>,
	tradesterHeaders: string[],
	hasTradesterColumns: boolean
) {
	if (!hasTradesterColumns) return generatedRow;

	return `${generatedRow},${tradesterHeaders.map((header) => tradester[header] ?? '').join(',')}`;
}

function isGeneratedPaddingRow(row: GeneratedRow) {
	return (
		row.time === 0 &&
		row.open === 0 &&
		row.high === 0 &&
		row.low === 0 &&
		row.close === 0 &&
		row.volume === 0
	);
}

function indexSierraRowsByTime(rows: SierraExportRow[], filePath: string) {
	const byTime = new Map<number, SierraExportRow>();

	for (const row of rows) {
		if (byTime.has(row.time))
			throw new Error(`Duplicate Sierra bar in ${filePath}: timestamp ${row.time.toString()}`);
		byTime.set(row.time, row);
	}

	return byTime;
}

function parseSierraExportRow(line: string, headers: string[]): SierraExportRow {
	const fields = line.split(',').map((field) => field.trim());
	if (fields.length < 13) throw new Error('Expected at least 13 Sierra export fields');

	const tradester: Record<string, string> = {};
	for (let i = 13; i < headers.length; i++) {
		if (headers[i].startsWith('tradester_')) tradester[headers[i]] = fields[i] ?? '';
	}

	return {
		close: Number(fields[5]),
		high: Number(fields[3]),
		low: Number(fields[4]),
		open: Number(fields[2]),
		time: parseSierraDateTime(`${fields[0]} ${fields[1]}`),
		tradester,
		volume: Number(fields[6])
	};
}

function compareGeneratedToSierra(
	generated: {
		close: number;
		high: number;
		low: number;
		open: number;
		time: number;
		volume: number;
	},
	sierra: SierraExportRow,
	rowIndex: number,
	filePath: string
) {
	if (generated.time !== sierra.time)
		throw new Error(
			`Sierra timestamp mismatch in ${filePath} at row ${rowIndex.toString()}: generated ${generated.time.toString()} vs Sierra ${sierra.time.toString()}`
		);
	compareGeneratedOhlcvToSierra(generated, sierra, rowIndex, filePath);
}

function compareGeneratedOhlcvToSierra(
	generated: {
		close: number;
		high: number;
		low: number;
		open: number;
		volume: number;
	},
	sierra: SierraExportRow,
	rowIndex: number,
	filePath: string
) {
	compareValue('open', generated.open, sierra.open, rowIndex, filePath);
	compareValue('high', generated.high, sierra.high, rowIndex, filePath);
	compareValue('low', generated.low, sierra.low, rowIndex, filePath);
	compareValue('close', generated.close, sierra.close, rowIndex, filePath);
	compareValue('volume', generated.volume, sierra.volume, rowIndex, filePath);
}

function compareValue(
	field: string,
	generated: number,
	sierra: number,
	rowIndex: number,
	filePath: string
) {
	if (generated === sierra) return;
	throw new Error(
		`Sierra ${field} mismatch in ${filePath} at row ${rowIndex.toString()}: generated ${generated.toString()} vs Sierra ${sierra.toString()}`
	);
}

function parseSierraDateTime(value: string) {
	const match = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/u.exec(
		value.trim()
	);
	if (match === null) throw new Error(`Unexpected Sierra DateTime value: ${value}`);
	const millisecond = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3));
	return utcDateTimeToUnixMs(
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
		Number(match[4]),
		Number(match[5]),
		Number(match[6]),
		millisecond
	);
}
