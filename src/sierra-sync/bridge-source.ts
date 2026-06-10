import { readFile } from 'node:fs/promises';

import type { OutputFiles, Symbol } from '../contracts/index.ts';
import { getSymbolConfig } from '../contracts/symbols.ts';
import { TIMEFRAMES } from './constants.ts';
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
	const ranges = await Promise.all(
		TIMEFRAMES.map(async (timeframe) => ({
			...timeframe,
			...(await readCsvTimeRange(files[timeframe.key]))
		}))
	);

	return `#include "sierrachart.h"
#include <cstring>

SCDLLName("Tradester Sync Bridge")

namespace {

const char* TargetSymbol() { return "tradester_${config.symbolId}"; }
float TargetTickSize() { return ${config.tickSize}; }
int TargetSessionStartTime() { return SCDateTime(17, 0, 0, 0).GetTime(); }
int TargetSessionEndTime() { return SCDateTime(16, 0, 0, 0).GetTime(); }
SCString ExportDirectory() { SCString path; path = "${escapeCppString(tempDir)}"; return path; }

int ChartExportIndex(SCStudyInterfaceRef sc)
{
    n_ACSIL::s_BarPeriod barPeriod;
    sc.GetBarPeriodParameters(barPeriod);

${ranges.map((range, index) => timeframeCondition(range, index)).join('\n\n')}

    return -1;
}

void LogChartState(SCStudyInterfaceRef sc, int exportIndex, const char* stage)
{
    n_ACSIL::s_BarPeriod barPeriod;
    sc.GetBarPeriodParameters(barPeriod);

    SCString message;
    message.Format(
        "Tradester Sync Bridge %s | chart=%d exportIndex=%d arraySize=%d downloading=%d dataType=%d periodType=%d periodParam1=%d symbol=%s start=%d end=%d",
        stage,
        sc.ChartNumber,
        exportIndex,
        sc.ArraySize,
        sc.ChartIsDownloadingHistoricalData(sc.ChartNumber),
        barPeriod.ChartDataType,
        barPeriod.IntradayChartBarPeriodType,
        barPeriod.IntradayChartBarPeriodParameter1,
        sc.Symbol.GetChars(),
        sc.ChartDataStartDate,
        sc.ChartDataEndDate
    );
    sc.AddMessageToLog(message, 0);
}

SCString ExportFileName(int index)
{
    switch (index)
    {
${ranges.map((range, index) => `        case ${index}: return "${sierraExportFileName(symbol, range.suffix)}";`).join('\n')}
        default: return "unknown_GraphData.txt";
    }
}

int DateYMD(int year, int month, int day)
{
    SCDateTime date;
    date.SetDateYMD(year, month, day);
    return date.GetDate();
}

int StartDate(int index)
{
    switch (index)
    {
${ranges.map((range, index) => `        case ${index}: return ${scDateCall(range.startTime)};`).join('\n')}
        default: return 0;
    }
}

int EndDate(int index)
{
    switch (index)
    {
${ranges.map((range, index) => `        case ${index}: return ${scDateCall(nextDateTime(range.endTime))};`).join('\n')}
        default: return 0;
    }
}

bool ChartNeedsSetup(SCStudyInterfaceRef sc, int exportIndex)
{
    return std::strcmp(sc.Symbol.GetChars(), TargetSymbol()) != 0 ||
        sc.TickSize != TargetTickSize() ||
        sc.LoadChartDataByDateRange == 0 ||
        sc.ChartDataStartDate != StartDate(exportIndex) ||
        sc.ChartDataEndDate != EndDate(exportIndex) ||
        sc.StartTime1 != TargetSessionStartTime() ||
        sc.EndTime1 != TargetSessionEndTime() ||
        sc.UseSecondStartEndTimes != 0;
}

}

SCSFExport scsf_TradesterSyncBridge(SCStudyInterfaceRef sc)
{
    if (sc.SetDefaults)
    {
        sc.GraphName = "Tradester Sync Bridge";
        sc.StudyDescription = "Exports Sierra chart bars once for Tradester validation.";
        sc.AutoLoop = 0;
        return;
    }

    int& exportComplete = sc.GetPersistentInt(1);
    int& lastLoggedArraySize = sc.GetPersistentInt(2);
    const int exportIndex = ChartExportIndex(sc);

    if (exportIndex < 0)
    {
        if (lastLoggedArraySize != -1)
        {
            LogChartState(sc, exportIndex, "unmatched-period");
            lastLoggedArraySize = -1;
        }
        return;
    }

    if (ChartNeedsSetup(sc, exportIndex))
    {
        exportComplete = 0;
        lastLoggedArraySize = -2;
        sc.Symbol = TargetSymbol();
        sc.TickSize = TargetTickSize();
        sc.LoadChartDataByDateRange = 1;
        sc.ChartDataStartDate = StartDate(exportIndex);
        sc.ChartDataEndDate = EndDate(exportIndex);
        sc.StartTime1 = TargetSessionStartTime();
        sc.EndTime1 = TargetSessionEndTime();
        sc.UseSecondStartEndTimes = 0;
        sc.FlagToReloadChartData = 1;
        LogChartState(sc, exportIndex, "setup-reload");
        return;
    }

    if (exportComplete != 0)
        return;

    if (sc.ArraySize == 0)
    {
        if (lastLoggedArraySize != 0)
        {
            LogChartState(sc, exportIndex, "empty-array");
            lastLoggedArraySize = 0;
        }
        return;
    }

    if (sc.ChartIsDownloadingHistoricalData(sc.ChartNumber) != 0)
    {
        if (lastLoggedArraySize != sc.ArraySize)
        {
            LogChartState(sc, exportIndex, "downloading");
            lastLoggedArraySize = sc.ArraySize;
        }
        return;
    }

    SCString path = ExportDirectory();
    path += "\\\\";
    path += ExportFileName(exportIndex);
    LogChartState(sc, exportIndex, "write-export");

    n_ACSIL::s_WriteBarAndStudyDataToFile writeParams;
    writeParams.StartingIndex = 0;
    writeParams.OutputPathAndFileName = path;
    writeParams.IncludeHiddenStudies = 1;
    writeParams.IncludeHiddenSubgraphs = 1;
    writeParams.IncludeLastBar = 1;
    sc.WriteBarAndStudyDataToFileEx(writeParams);
    exportComplete = 1;
}
`;
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

function timeframeCondition(timeframe: { suffix: string }, index: number) {
	if (timeframe.suffix === '1d')
		return `    if (sc.ChartNumber == 5 || barPeriod.ChartDataType == DAILY_DATA || (barPeriod.HistoricalChartBarPeriodType == HISTORICAL_CHART_PERIOD_DAYS && barPeriod.HistoricalChartDaysPerBar == 1)) return ${index};`;
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
	return value.replaceAll('\\', '\\\\');
}
