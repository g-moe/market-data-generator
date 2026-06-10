import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { CANDLE_ROW_HEADER } from '../shared/file-ops/csv.ts';
import {
	SIERRA_EXPORT_HEADER,
	SIERRA_TIME_ZONE,
	TIMEFRAMES
} from './constants.ts';
import { sierraExportFileName } from './paths.ts';

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

	for (const timeframe of TIMEFRAMES) {
		if (timeframe.suffix === '500v') continue;

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
	if (generated.rows.length === 0)
		throw new Error(`Cannot validate empty generated file: ${inputFile}`);
	const tradesterHeaders = Object.keys(
		sierra.find((row) => Object.keys(row.tradester).length > 0)?.tradester ?? {}
	);
	const outputRows = [`${generated.header},${tradesterHeaders.join(',')}`];
	const sierraByTime = indexSierraRowsByTime(sierra, inputFile);

	for (let i = 0; i < generated.rows.length; i++) {
		const generatedRow = generated.rows[i];
		const sierraRow = sierraByTime.get(generatedRow.time);
		if (sierraRow === undefined)
			throw new Error(
				`Missing Sierra bar in ${inputFile} at row ${i.toString()}: generated timestamp ${generatedRow.time.toString()}`
			);

		compareGeneratedToSierra(generatedRow, sierraRow, i, inputFile);
		outputRows.push(
			`${generatedRow.raw},${tradesterHeaders.map((header) => sierraRow.tradester[header] ?? '').join(',')}`
		);
	}
	await mkdir(dirname(outputFile), { recursive: true });
	await writeFile(outputFile, `${outputRows.join('\n')}\n`);

	return { comparedRows: generated.rows.length, outputFile };
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
		return { header: lines[0] ?? CANDLE_ROW_HEADER, rows: [] };

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

function indexSierraRowsByTime(rows: SierraExportRow[], filePath: string) {
	const byTime = new Map<number, SierraExportRow>();

	for (const row of rows) {
		if (byTime.has(row.time))
			throw new Error(
				`Duplicate Sierra bar in ${filePath}: timestamp ${row.time.toString()}`
			);
		byTime.set(row.time, row);
	}

	return byTime;
}

function parseSierraExportRow(
	line: string,
	headers: string[]
): SierraExportRow {
	const fields = line.split(',').map((field) => field.trim());
	if (fields.length < 13)
		throw new Error('Expected at least 13 Sierra export fields');

	const tradester: Record<string, string> = {};
	for (let i = 13; i < headers.length; i++) {
		if (headers[i].startsWith('tradester_'))
			tradester[headers[i]] = fields[i] ?? '';
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
	const match =
		/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/u.exec(
			value.trim()
		);
	if (match === null)
		throw new Error(`Unexpected Sierra DateTime value: ${value}`);
	const millisecond = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3));
	const candidate = Date.UTC(
		Number(match[1]),
		Number(match[2]) - 1,
		Number(match[3]),
		Number(match[4]),
		Number(match[5]),
		Number(match[6]),
		millisecond
	);

	return candidate - timeZoneOffsetMs(candidate, SIERRA_TIME_ZONE);
}

function timeZoneOffsetMs(utcMs: number, timeZone: string) {
	const wholeSecondUtcMs = utcMs - (utcMs % 1000);
	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		month: '2-digit',
		second: '2-digit',
		timeZone,
		year: 'numeric'
	}).formatToParts(new Date(wholeSecondUtcMs));
	const values = Object.fromEntries(
		parts
			.filter((part) => part.type !== 'literal')
			.map((part) => [part.type, part.value])
	) as Record<string, string>;

	return (
		Date.UTC(
			Number(values.year),
			Number(values.month) - 1,
			Number(values.day),
			Number(values.hour),
			Number(values.minute),
			Number(values.second)
		) - wholeSecondUtcMs
	);
}
