#include "sierrachart.h"

#include <filesystem>
#include <fstream>
#include <string>

SCDLLName("Tradester Sync Bridge")

namespace {

const char* ExportFileNameForChartNumber(int chartNumber)
{
    switch (chartNumber)
    {
        case 1:
            return "tradester_ES_1s_GraphData.txt";
        case 2:
            return "tradester_ES_15s_GraphData.txt";
        case 3:
            return "tradester_ES_500v_GraphData.txt";
        case 4:
            return "tradester_ES_5m_GraphData.txt";
        case 5:
            return "tradester_ES_1d_GraphData.txt";
        default:
            return "";
    }
}

std::filesystem::path ExportDirectory()
{
    return std::filesystem::path("__TRADESTER_SIERRA_EXPORT_DIR__");
}

void WriteChartDataExport(const std::filesystem::path& exportPath, SCStudyInterfaceRef sc)
{
    std::filesystem::create_directories(exportPath.parent_path());
    std::ofstream output(exportPath, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!output.is_open())
        return;

    output << "DateTime\tOpen\tHigh\tLow\tLast\tVolume\tNumberOfTrades\tBidVolume\tAskVolume\n";
    for (int index = 0; index < sc.ArraySize; ++index)
    {
        SCString dateTime;
        dateTime = sc.FormatDateTime(sc.BaseDateTimeIn[index]);
        output << dateTime.GetChars() << '\t'
               << sc.Open[index] << '\t'
               << sc.High[index] << '\t'
               << sc.Low[index] << '\t'
               << sc.Close[index] << '\t'
               << sc.Volume[index] << '\t'
               << sc.NumberOfTrades[index] << '\t'
               << sc.BidVolume[index] << '\t'
               << sc.AskVolume[index] << '\n';
    }
}

} // namespace

SCSFExport scsf_TradesterSyncBridge(SCStudyInterfaceRef sc)
{
    if (sc.SetDefaults)
    {
        sc.GraphName = "Tradester Sync Bridge";
        sc.StudyDescription = "Writes fixed temporary chart data exports for Tradester validation.";
        sc.AutoLoop = 0;
        sc.UpdateAlways = 1;
        return;
    }

    const char* fileName = ExportFileNameForChartNumber(sc.ChartNumber);
    if (fileName[0] == '\0')
        return;

    sc.FlagToReloadChartData = 1;
    sc.FlagFullRecalculate = 1;
    WriteChartDataExport(ExportDirectory() / fileName, sc);
}