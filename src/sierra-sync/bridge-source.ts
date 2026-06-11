import { readFile } from 'node:fs/promises';

import type { OutputFiles, OutputMetadata, Symbol, TimeframeKey } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import { toUtcParts } from '../shared/datetime/index.ts';
import { getTimeframes } from '../contracts/index.ts';
import { SIERRA_BRIDGE_FILE_NAME, SIERRA_SOURCE_ROOT, SIERRA_DATA_DIR } from './constants.ts';
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
	const template = await readFile(`${SIERRA_SOURCE_ROOT}/${SIERRA_BRIDGE_FILE_NAME}`, 'utf8');
	const metadata = await readOutputMetadata(files.metadata);
	const ranges = getTimeframes(symbol).map((timeframe) => ({
		...timeframe,
		...readMetadataTimeRange(metadata, timeframe.key)
	}));

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
			.map((range, index) => `        case ${index}: return ${scDateCall(range.startTime)};`)
			.join('\n'),
		__TRADESTER_TARGET_DATA_FILE__: escapeCppString(sierraDataFilePath(config.symbolId)),
		__TRADESTER_TICK_SIZE__: config.tickSize.toString()
	});
}

function replaceTemplateTokens(template: string, replacements: Record<string, string>) {
	let source = template;

	for (const [token, replacement] of Object.entries(replacements)) {
		source = source.replaceAll(token, replacement);
	}

	const missingToken = source.match(/__TRADESTER_[A-Z_]+__/u)?.[0];
	if (missingToken !== undefined)
		throw new Error(`Missing Sierra bridge token replacement: ${missingToken}`);

	return source;
}

async function readOutputMetadata(filePath: string): Promise<OutputMetadata> {
	const parsed = JSON.parse(await readFile(filePath, 'utf8')) as OutputMetadata;
	if (parsed.timeframes === undefined) {
		throw new Error(`Generated metadata is missing timeframes: ${filePath}`);
	}

	return parsed;
}

function readMetadataTimeRange(metadata: OutputMetadata, timeframe: TimeframeKey) {
	const range = metadata.timeframes[timeframe];
	if (range === undefined) {
		throw new Error(`Generated metadata is missing timeframe range: ${timeframe}`);
	}

	return range;
}

function timeframeCondition(timeframe: { suffix: string }, index: number) {
	if (timeframe.suffix === '1d')
		return `    if (barPeriod.ChartDataType == DAILY_DATA || (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_DAYS_MINS_SECS && barPeriod.IntradayChartBarPeriodParameter1 == 1440 * 60)) return ${index};`;

	if (timeframe.suffix.endsWith('v'))
		return `    if (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_VOLUME_PER_BAR && barPeriod.IntradayChartBarPeriodParameter1 == ${timeframe.suffix.slice(0, -1)}) return ${index};`;

	if (timeframe.suffix.endsWith('t'))
		return `    if (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_NUM_TRADES_PER_BAR && barPeriod.IntradayChartBarPeriodParameter1 == ${timeframe.suffix.slice(0, -1)}) return ${index};`;

	let seconds: number;
	if (timeframe.suffix.startsWith('1s_')) seconds = 1;
	else if (timeframe.suffix.endsWith('m')) seconds = Number(timeframe.suffix.slice(0, -1)) * 60;
	else seconds = Number(timeframe.suffix.slice(0, -1));

	return `    if (barPeriod.ChartDataType == INTRADAY_DATA && barPeriod.IntradayChartBarPeriodType == IBPT_DAYS_MINS_SECS && barPeriod.IntradayChartBarPeriodParameter1 == ${seconds.toString()}) return ${index};`;
}

function nextDateTime(time: number) {
	return time + 24 * 60 * 60 * 1000;
}

function sierraDataFilePath(symbolId: string) {
	return `${SIERRA_DATA_DIR}\\tradester_${symbolId}.scid`;
}

function scDateCall(time: number) {
	const date = toUtcParts(time);
	const year = date.year;
	const month = date.month;
	const day = date.day;

	return `DateYMD(${year}, ${month}, ${day})`;
}

function escapeCppString(value: string) {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
