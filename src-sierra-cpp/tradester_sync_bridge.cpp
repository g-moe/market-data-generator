#include "sierrachart.h"
#include <cstring>

SCDLLName("Tradester Sync Bridge")

namespace {

float TargetTickSize() { return __TRADESTER_TICK_SIZE__; }
int TargetBaseGraphValueFormat() { return __TRADESTER_BASE_GRAPH_VALUE_FORMAT__; }
int TargetSessionStartTime() { return SCDateTime(22, 0, 0, 0).GetTime(); }
int TargetSessionEndTime() { return SCDateTime(21, 0, 0, 0).GetTime(); }
SCString ExportDirectory() { SCString path; path = "__TRADESTER_EXPORT_DIR__"; return path; }

SCString TargetDataFile(int index)
{
    switch (index)
    {
__TRADESTER_TARGET_DATA_FILE_CASES__
        default: return "";
    }
}

int ChartExportIndex(SCStudyInterfaceRef sc)
{
    n_ACSIL::s_BarPeriod barPeriod;
    sc.GetBarPeriodParameters(barPeriod);

__TRADESTER_CHART_EXPORT_CASES__

    return -1;
}

void LogChartState(SCStudyInterfaceRef sc, int exportIndex, const char* stage)
{
    n_ACSIL::s_BarPeriod barPeriod;
    sc.GetBarPeriodParameters(barPeriod);

    SCString message;
    message.Format(
        "Tradester Sync Bridge %s | chart=%d exportIndex=%d arraySize=%d downloading=%d dataType=%d periodType=%d periodParam1=%d symbol=%s tickSize=%f baseGraphValueFormat=%d start=%d end=%d",
        stage,
        sc.ChartNumber,
        exportIndex,
        sc.ArraySize,
        sc.ChartIsDownloadingHistoricalData(sc.ChartNumber),
        barPeriod.ChartDataType,
        barPeriod.IntradayChartBarPeriodType,
        barPeriod.IntradayChartBarPeriodParameter1,
        sc.DataFile.GetChars(),
        static_cast<double>(sc.TickSize),
        sc.BaseGraphValueFormat,
        sc.ChartDataStartDate,
        sc.ChartDataEndDate
    );
    sc.AddMessageToLog(message, 0);
}

SCString ExportFileName(int index)
{
    switch (index)
    {
__TRADESTER_EXPORT_FILE_CASES__
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
__TRADESTER_START_DATE_CASES__
        default: return 0;
    }
}

int EndDate(int index)
{
    switch (index)
    {
__TRADESTER_END_DATE_CASES__
        default: return 0;
    }
}

bool ChartNeedsSetup(SCStudyInterfaceRef sc, int exportIndex)
{
    return std::strcmp(sc.DataFile.GetChars(), TargetDataFile(exportIndex).GetChars()) != 0 ||
        sc.TickSize != TargetTickSize() ||
        sc.BaseGraphValueFormat != TargetBaseGraphValueFormat() ||
        sc.LoadChartDataByDateRange == 0 ||
        sc.ChartDataStartDate != StartDate(exportIndex) ||
        sc.ChartDataEndDate != EndDate(exportIndex) ||
        sc.StartTime1 != TargetSessionStartTime() ||
        sc.EndTime1 != TargetSessionEndTime() ||
        sc.UseSecondStartEndTimes != 0;
}

int ApplyInheritedStudyValueFormats(SCStudyInterfaceRef sc)
{
    int changedCount = 0;

    for (int studyIndex = 1;; studyIndex++)
    {
        const int studyID = sc.GetStudyIDByIndex(sc.ChartNumber, studyIndex);
        if (studyID == 0)
            break;

        if (sc.GetChartStudyValueFormat(sc.ChartNumber, studyID) == VALUEFORMAT_INHERITED)
            continue;

        if (sc.SetChartStudyValueFormat(sc.ChartNumber, studyID, VALUEFORMAT_INHERITED) != 0)
            changedCount++;
    }

    return changedCount;
}

}

SCSFExport scsf_TradesterSyncBridge(SCStudyInterfaceRef sc)
{
    if (sc.SetDefaults)
    {
        sc.GraphName = "Tradester Sync Bridge";
        sc.StudyDescription = "Exports Sierra chart bars once for Tradester validation.";
        sc.GraphRegion = 0;
        sc.ValueFormat = VALUEFORMAT_INHERITED;
        sc.CalculationPrecedence = VERY_LOW_PREC_LEVEL;
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
        sc.DataFile = TargetDataFile(exportIndex);
        sc.TickSize = TargetTickSize();
        sc.BaseGraphValueFormat = TargetBaseGraphValueFormat();
        sc.LoadChartDataByDateRange = 1;
        sc.ChartDataStartDate = StartDate(exportIndex);
        sc.ChartDataEndDate = EndDate(exportIndex);
        sc.SetChartTimeZone(
            sc.ChartNumber,
            static_cast<TimeZonesEnum>(TIMEZONE_UTC)
        );
        sc.StartTime1 = TargetSessionStartTime();
        sc.EndTime1 = TargetSessionEndTime();
        sc.UseSecondStartEndTimes = 0;
        sc.FlagToReloadChartData = 1;
        sc.GraphRegion = 0;
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
    path += "\\";
    path += ExportFileName(exportIndex);
    LogChartState(sc, exportIndex, "write-export");
    const int changedStudyFormats = ApplyInheritedStudyValueFormats(sc);
    if (changedStudyFormats > 0)
    {
        SCString message;
        message.Format(
            "Tradester Sync Bridge applied inherited value format to %d studies on chart %d",
            changedStudyFormats,
            sc.ChartNumber
        );
        sc.AddMessageToLog(message, 0);
    }

    n_ACSIL::s_WriteBarAndStudyDataToFile writeParams;
    writeParams.StartingIndex = 0;
    writeParams.OutputPathAndFileName = path;
    writeParams.IncludeHiddenStudies = 1;
    writeParams.IncludeHiddenSubgraphs = 1;
    writeParams.IncludeLastBar = 1;
    sc.WriteBarAndStudyDataToFileEx(writeParams);
    exportComplete = 1;
}
