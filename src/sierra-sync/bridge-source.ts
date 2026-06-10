import { readFile } from 'node:fs/promises';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import {
	SIERRA_BRIDGE_FILE_NAME,
	SIERRA_SOURCE_ROOT,
	TIMEFRAMES
} from './constants.ts';
import { sierraExportFileName } from './paths.ts';

export async function createBridgeSource({
	files,
	symbol,
	tempDir
}: {
	files: OutputFiles;
	symbol: Symbol;
	tempDir: string;
}) {
	const config = getSymbolConfig(symbol);
	const template = await readFile(
		`${SIERRA_SOURCE_ROOT}/${SIERRA_BRIDGE_FILE_NAME}`,
		'utf8'
	);
	const ranges = await Promise.all(
		TIMEFRAMES.map(async (timeframe) => ({
			...timeframe,
			...(await readCsvTimeRange(files[timeframe.key]))
		}))
	);

	return replaceTemplateTokens(template, {
		__TRADESTER_CHART_EXPORT_CASES__: ranges
			.map((range, index) => timeframeCondition(range, index))
			.join('\n\n'),
		__TRADESTER_END_DATE_CASES__: ranges
			.map(
				(range, index) =>
					`        case ${index}: return ${scDateCall(nextDateTime(range.endTime))};`
			)
			.join('\n'),
		__TRADESTER_EXPORT_DIR__: escapeCppString(tempDir),
		__TRADESTER_EXPORT_FILE_CASES__: ranges
			.map(
				(range, index) =>
					`        case ${index}: return "${sierraExportFileName(symbol, range.suffix)}";`
			)
			.join('\n'),
		__TRADESTER_START_DATE_CASES__: ranges
			.map(
				(range, index) =>
					`        case ${index}: return ${scDateCall(range.startTime)};`
			)
			.join('\n'),
		__TRADESTER_TARGET_SYMBOL__: `tradester_${config.symbolId}`,
		__TRADESTER_TICK_SIZE__: config.tickSize.toString()
	});
}

async function readCsvTimeRange(filePath: string) {
	const text = await readFile(filePath, 'utf8');
	const lines = text.trimEnd().split(/\r?\n/u).filter(Boolean);
	if (lines.length <= 1)
		throw new Error(
			`Cannot derive Sierra date range from empty file: ${filePath}`
		);
	const headers = lines[0].split(',');
	const timeIndex = headers.indexOf('time');
	if (timeIndex === -1)
		throw new Error(`Generated file is missing time column: ${filePath}`);

	return {
		endTime: Number(lines[lines.length - 1].split(',')[timeIndex]),
		startTime: Number(lines[1].split(',')[timeIndex])
	};
}

function replaceTemplateTokens(
	template: string,
	replacements: Record<string, string>
) {
	let source = template;

	for (const [token, replacement] of Object.entries(replacements)) {
		source = source.replaceAll(token, replacement);
	}

	const missingToken = source.match(/__TRADESTER_[A-Z_]+__/u)?.[0];
	if (missingToken !== undefined)
		throw new Error(`Missing Sierra bridge token replacement: ${missingToken}`);

	return source;
}

function timeframeCondition(timeframe: { suffix: string }, index: number) {
	if (timeframe.suffix.endsWith('v'))
		return `    if (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_VOLUME_PER_BAR && barPeriod.IntradayChartBarPeriodParameter1 == ${timeframe.suffix.slice(0, -1)}) return ${index};`;

	let seconds: number;
	if (timeframe.suffix.startsWith('1s_')) seconds = 1;
	else if (timeframe.suffix.endsWith('m'))
		seconds = Number(timeframe.suffix.slice(0, -1)) * 60;
	else seconds = Number(timeframe.suffix.slice(0, -1));

	return `    if (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_DAYS_MINS_SECS && barPeriod.IntradayChartBarPeriodParameter1 == ${seconds.toString()}) return ${index};`;
}

function nextDateTime(time: number) {
	return time + 24 * 60 * 60 * 1000;
}

function scDateCall(time: number) {
	const date = new Date(time);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth() + 1;
	const day = date.getUTCDate();

	return `DateYMD(${year}, ${month}, ${day})`;
}

function escapeCppString(value: string) {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
