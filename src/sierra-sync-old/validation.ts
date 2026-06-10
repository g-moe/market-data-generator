import { readFile } from 'node:fs/promises';

import type { StoredMdCandle } from '../contracts/types.ts';
import { SIERRA_GRAPH_DATA_HEADER, SIERRA_TIME_ZONE } from './constants.ts';
import {
	CANDLE_ROW_HEADER,
	parseCandleRowsFast,
	PRICE_LEVEL_CANDLE_ROW_HEADER
} from '../shared/file-ops/csv.ts';

type SierraGraphDataRow = {
	time: number;
	open: number;
	high: number;
	low: number;
	last: number;
	volume: number;
};

export type SierraBarValidationResult = {
	generatedFilePath: string;
	sierraFilePath: string;
	skippedSierraRows: number;
	comparedRows: number;
	firstMatchedTimestamp: number;
	lastMatchedTimestamp: number;
};

export async function validateSierraOneSecondBars({
	generatedFilePath,
	sierraFilePath
}: {
	generatedFilePath: string;
	sierraFilePath: string;
}): Promise<SierraBarValidationResult> {
	const [generatedText, sierraText] = await Promise.all([
		readFile(generatedFilePath, 'utf8'),
		readFile(sierraFilePath, 'utf8')
	]);
	const generatedRows = parseGeneratedRows(generatedText);
	const sierraRows = parseSierraGraphDataRows(sierraText);

	if (generatedRows.length === 0) {
		throw new Error(
			`Cannot validate empty generated 1-second file: ${generatedFilePath}`
		);
	}

	const startIndex = sierraRows.findIndex(
		(row) => row.time === generatedRows[0].time
	);

	if (startIndex === -1) {
		throw new Error(
			`Sierra 1-second export does not contain generated start timestamp ${generatedRows[0].time.toString()}`
		);
	}

	for (let i = 0; i < generatedRows.length; i++) {
		const generated = generatedRows[i];
		const sierra = sierraRows[startIndex + i];

		if (sierra === undefined) {
			throw new Error(
				`Sierra 1-second export ended after ${i.toString()} compared rows; expected ${generatedRows.length.toString()}`
			);
		}

		compareRow({ generated, rowIndex: i, sierra });
	}

	return {
		comparedRows: generatedRows.length,
		firstMatchedTimestamp: generatedRows[0].time,
		generatedFilePath,
		lastMatchedTimestamp: generatedRows[generatedRows.length - 1].time,
		sierraFilePath,
		skippedSierraRows: startIndex
	};
}

export function parseSierraGraphDataRows(text: string): SierraGraphDataRow[] {
	const lines = text.trimEnd().split(/\r?\n/u);
	if (lines.length <= 1) return [];

	if (!isExpectedSierraGraphDataHeader(lines[0])) {
		throw new Error('Unexpected Sierra GraphData header');
	}

	return lines.slice(1).filter(Boolean).map(parseSierraGraphDataRow);
}

function isExpectedSierraGraphDataHeader(header: string) {
	return (
		header === SIERRA_GRAPH_DATA_HEADER ||
		header.startsWith(SIERRA_GRAPH_DATA_HEADER + ', ')
	);
}

function parseGeneratedRows(text: string) {
	const lines = text.trimEnd().split(/\r?\n/u);
	if (lines[0] === CANDLE_ROW_HEADER) return parseCandleRowsFast(text);
	if (lines[0] !== PRICE_LEVEL_CANDLE_ROW_HEADER) {
		throw new Error('Unexpected generated 1-second row header');
	}

	const candleText = [
		CANDLE_ROW_HEADER,
		...lines
			.slice(1)
			.filter(Boolean)
			.map((line) => line.split(',').slice(0, 11).join(','))
	].join('\n');
	return parseCandleRowsFast(`${candleText}\n`);
}

function parseSierraGraphDataRow(line: string): SierraGraphDataRow {
	const fields = line.split(',').map((field) => field.trim());

	if (fields.length < 13) {
		throw new Error('Expected at least 13 Sierra GraphData fields');
	}

	return {
		high: Number(fields[3]),
		last: Number(fields[5]),
		low: Number(fields[4]),
		open: Number(fields[2]),
		time: parseSierraDateTime(fields[0] + ' ' + fields[1]),
		volume: Number(fields[6])
	};
}

export function formatSierraGraphDataDateTime(time: number) {
	const values = timeZoneDateTimeParts(time, SIERRA_TIME_ZONE);

	return {
		clock: values.hour + ':' + values.minute + ':' + values.second,
		date: values.year + '-' + values.month + '-' + values.day
	};
}

function parseSierraDateTime(value: string) {
	const match =
		/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/u.exec(
			value.trim()
		);

	if (match === null) {
		throw new Error(`Unexpected Sierra DateTime value: ${value}`);
	}

	return localDateTimeToUtcMs(
		{
			day: Number(match[3]),
			hour: Number(match[4]),
			minute: Number(match[5]),
			month: Number(match[2]),
			second: Number(match[6]),
			year: Number(match[1])
		},
		SIERRA_TIME_ZONE
	);
}

function localDateTimeToUtcMs(
	localParts: {
		year: number;
		month: number;
		day: number;
		hour: number;
		minute: number;
		second: number;
	},
	timeZone: string
) {
	const candidate = Date.UTC(
		localParts.year,
		localParts.month - 1,
		localParts.day,
		localParts.hour,
		localParts.minute,
		localParts.second
	);
	const offset = timeZoneOffsetMs(candidate, timeZone);

	return candidate - offset;
}

function timeZoneOffsetMs(utcMs: number, timeZone: string) {
	const values = timeZoneDateTimeParts(utcMs, timeZone);

	return (
		Date.UTC(
			Number(values.year),
			Number(values.month) - 1,
			Number(values.day),
			Number(values.hour),
			Number(values.minute),
			Number(values.second)
		) - utcMs
	);
}

function timeZoneDateTimeParts(utcMs: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		month: '2-digit',
		second: '2-digit',
		timeZone,
		year: 'numeric'
	}).formatToParts(new Date(utcMs));

	return Object.fromEntries(
		parts
			.filter((part) => part.type !== 'literal')
			.map((part) => [part.type, part.value])
	) as Record<string, string>;
}

function compareRow({
	generated,
	rowIndex,
	sierra
}: {
	generated: StoredMdCandle;
	rowIndex: number;
	sierra: SierraGraphDataRow;
}) {
	if (generated.time !== sierra.time) {
		throw new Error(
			`Sierra 1-second timestamp mismatch at compared row ${rowIndex.toString()}: generated ${generated.time.toString()} vs Sierra ${sierra.time.toString()}`
		);
	}

	compareValue('open', generated.open, sierra.open, rowIndex, generated.time);
	compareValue('high', generated.high, sierra.high, rowIndex, generated.time);
	compareValue('low', generated.low, sierra.low, rowIndex, generated.time);
	compareValue('close', generated.close, sierra.last, rowIndex, generated.time);
	compareValue(
		'volume',
		generated.volume,
		sierra.volume,
		rowIndex,
		generated.time
	);
}

function compareValue(
	field: string,
	generated: number,
	sierra: number,
	rowIndex: number,
	timestamp: number
) {
	if (generated === sierra) return;

	throw new Error(
		`Sierra 1-second ${field} mismatch at compared row ${rowIndex.toString()} timestamp ${timestamp.toString()}: generated ${generated.toString()} vs Sierra ${sierra.toString()}`
	);
}
