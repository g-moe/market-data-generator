#include "sierrachart.h"

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

SCDLLName("Tradester Sync Bridge")

namespace {

std::string ReadTextFile(const char* path)
{
    std::ifstream input(path, std::ios::in | std::ios::binary);
    if (!input.is_open())
        return {};

    std::ostringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
}

std::string ExtractJsonString(const std::string& json, const char* key)
{
    const std::string quotedKey = std::string("\"") + key + "\"";
    const size_t keyPosition = json.find(quotedKey);
    if (keyPosition == std::string::npos)
        return {};

    const size_t colonPosition = json.find(':', keyPosition + quotedKey.size());
    if (colonPosition == std::string::npos)
        return {};

    const size_t valueStart = json.find('"', colonPosition + 1);
    if (valueStart == std::string::npos)
        return {};

    const size_t valueEnd = json.find('"', valueStart + 1);
    if (valueEnd == std::string::npos)
        return {};

    return json.substr(valueStart + 1, valueEnd - valueStart - 1);
}

std::string ExtractJsonStringInObject(const std::string& json, const char* objectKey, const char* key)
{
    const std::string quotedObjectKey = std::string("\"") + objectKey + "\"";
    const size_t objectPosition = json.find(quotedObjectKey);
    if (objectPosition == std::string::npos)
        return {};

    return ExtractJsonString(json.substr(objectPosition), key);
}

std::string ExportKeyForChartNumber(int chartNumber)
{
    switch (chartNumber)
    {
        case 1:
            return "priceLevel";
        case 2:
            return "seconds15";
        case 3:
            return "volume500";
        case 4:
            return "minutes5";
        case 5:
            return "daily";
        default:
            return {};
    }
}

std::string WriteChartDataExport(const std::string& directory, const std::string& fileName, SCStudyInterfaceRef sc)
{
    if (directory.empty() || fileName.empty())
        return {};

    std::filesystem::create_directories(directory);
    const std::filesystem::path exportPath = std::filesystem::path(directory) / fileName;
    std::ofstream output(exportPath, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!output.is_open())
        return {};

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

    return exportPath.string();
}

std::string EscapeJsonString(const std::string& value)
{
    std::string escaped;
    for (const char character : value)
    {
        if (character == '\\' || character == '"')
            escaped += '\\';
        escaped += character;
    }
    return escaped;
}
void WriteAcknowledgement(const char* path, const std::string& runId, const std::string& dataOutTempDir, const std::string& exportedFile, SCStudyInterfaceRef sc)
{
    std::ofstream output(path, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!output.is_open())
        return;

    SCString dateTime;
    dateTime = sc.FormatDateTime(sc.CurrentSystemDateTime);

    output << "{\n"
           << "  \"runId\": \"" << runId << "\",\n"
           << "  \"chartNumber\": " << sc.ChartNumber << ",\n"
           << "  \"dataOutTempDir\": \"" << EscapeJsonString(dataOutTempDir) << "\",\n"
           << "  \"exportedFile\": \"" << EscapeJsonString(exportedFile) << "\",\n"
           << "  \"reloadedAt\": \"" << dateTime.GetChars() << "\"\n"
           << "}\n";
}

} // namespace

SCSFExport scsf_TradesterSyncBridge(SCStudyInterfaceRef sc)
{
    SCInputRef RequestPath = sc.Input[0];
    SCInputRef AcknowledgementPath = sc.Input[1];

    if (sc.SetDefaults)
    {
        sc.GraphName = "Tradester Sync Bridge";
        sc.StudyDescription = "Reads tradester-sync-request.json, reloads chart data, writes temporary chart data exports, and writes tradester-sync-ack.json.";
        sc.AutoLoop = 0;
        sc.UpdateAlways = 1;

        RequestPath.Name = "Request JSON Path";
        RequestPath.SetString("C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart\\Data\\tradester-sync-request.json");

        AcknowledgementPath.Name = "Acknowledgement JSON Path";
        AcknowledgementPath.SetString("C:\\Trading Software\\DEV-Sierra-Chart\\Sierra Chart\\Data\\tradester-sync-ack.json");

        return;
    }

    const std::string request = ReadTextFile(RequestPath.GetString());
    if (request.empty())
        return;

    const std::string runId = ExtractJsonString(request, "runId");
    if (runId.empty())
        return;

    SCString& lastRunId = sc.GetPersistentSCString(1);
    if (std::string(lastRunId.GetChars()) == runId)
        return;

    lastRunId = runId.c_str();

    sc.FlagToReloadChartData = 1;
    sc.FlagFullRecalculate = 1;

    const std::string exportKey = ExportKeyForChartNumber(sc.ChartNumber);
    const std::string exportFileName = exportKey.empty() ? std::string() : ExtractJsonStringInObject(request, "exportFiles", exportKey.c_str());
    const std::string dataOutTempDir = ExtractJsonString(request, "dataOutTempDir");
    const std::string exportedFile = WriteChartDataExport(dataOutTempDir, exportFileName, sc);

    WriteAcknowledgement(AcknowledgementPath.GetString(), runId, dataOutTempDir, exportedFile, sc);
}
