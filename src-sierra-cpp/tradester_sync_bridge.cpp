#include "sierrachart.h"

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

void WriteAcknowledgement(const char* path, const std::string& runId, SCStudyInterfaceRef sc)
{
    std::ofstream output(path, std::ios::out | std::ios::binary | std::ios::trunc);
    if (!output.is_open())
        return;

    SCString dateTime;
    dateTime = sc.FormatDateTime(sc.CurrentSystemDateTime);

    output << "{\n"
           << "  \"runId\": \"" << runId << "\",\n"
           << "  \"chartNumber\": " << sc.ChartNumber << ",\n"
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
        sc.StudyDescription = "Reads tradester-sync-request.json, reloads chart data, and writes tradester-sync-ack.json.";
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

    WriteAcknowledgement(AcknowledgementPath.GetString(), runId, sc);
}
