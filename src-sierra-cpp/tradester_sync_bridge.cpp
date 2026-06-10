#include "sierrachart.h"

#include <cctype>
#include <string>

SCDLLName("Tradester Sync Bridge")

namespace {

std::string SafeFilePart(const char* value)
{
    std::string result;
    for (const unsigned char character : std::string(value))
    {
        if (std::isalnum(character))
            result.push_back(static_cast<char>(character));
        else if (!result.empty() && result.back() != '_')
            result.push_back('_');
    }

    while (!result.empty() && result.back() == '_')
        result.pop_back();

    return result.empty() ? "unknown" : result;
}

std::string BarPeriodSuffix(SCStudyInterfaceRef sc)
{
    n_ACSIL::s_BarPeriod barPeriod;
    sc.GetBarPeriodParameters(barPeriod);

    if (barPeriod.ChartDataType == DAILY_DATA)
        return "1d";

    if (barPeriod.ChartDataType == INTRADAY_DATA)
    {
        const int parameter = barPeriod.IntradayChartBarPeriodParameter1;

        if (barPeriod.IntradayChartBarPeriodType == IBPT_DAYS_MINS_SECS)
        {
            if (parameter == 24 * 60 * 60)
                return "1d";

            if (parameter % 60 == 0)
                return std::to_string(parameter / 60) + "m";

            return std::to_string(parameter) + "s";
        }

        if (barPeriod.IntradayChartBarPeriodType == IBPT_VOLUME_PER_BAR)
            return std::to_string(parameter) + "v";
    }

    return "chart_" + std::to_string(sc.ChartNumber);
}

SCString ExportPath(SCStudyInterfaceRef sc)
{
    const std::string symbol = SafeFilePart(sc.Symbol.GetChars());
    const std::string period = BarPeriodSuffix(sc);

    SCString path;
    path.Format(
        "__TRADESTER_SIERRA_EXPORT_DIR__\\%s_%s_GraphData.txt",
        symbol.c_str(),
        period.c_str()
    );

    return path;
}

}

SCSFExport scsf_TradesterSyncBridge(SCStudyInterfaceRef sc)
{
    if (sc.SetDefaults)
    {
        sc.GraphName = "Tradester Sync Bridge";
        sc.StudyDescription = "Writes fixed temporary chart data exports for Tradester validation.";
        sc.AutoLoop = 0;
        return;
    }

    int& hasExported = sc.GetPersistentInt(1);
    if (sc.IsFullRecalculation && sc.UpdateStartIndex == 0)
        hasExported = 0;

    if (hasExported != 0 || sc.ArraySize == 0)
        return;

    if (sc.ChartIsDownloadingHistoricalData(sc.ChartNumber) != 0)
        return;

    SCString outputPath = ExportPath(sc);
    sc.WriteBarAndStudyDataToFile(0, outputPath, 1, 1);
    hasExported = 1;
}
