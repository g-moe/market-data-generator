# M3 Research: Sierra Chart Bar Comparison Automation

## Question

We need to start planning an automated way to compare whether our bars, aggregated from ticks, match what Sierra Chart does. Sierra Chart takes in the raw `.scid` data.

If we were to run this in Sierra Chart, could we automate this comparison process?

Do deep research on the Sierra Chart docs about how we can interface and communicate with the Sierra Chart process. Even if it is just getting Sierra Chart to write the chart bars to a file and we look for file last modification, then compare against our bars. That is just an initial idea.

Become a Sierra Chart expert with regard to this goal and give the most reasonable 3 options for this.

## Answer

Yes, we can automate this, but probably not by remote-controlling Sierra Chart through a rich command-line interface.

Sierra Chart's documented command-line parameters are basically just login parameters. So the practical automation path is to run Sierra Chart with a prepared chartbook and either read files it writes, query its DTC server, or install a small ACSIL custom study that exports exactly what we need.

Assumption: our generated `.scid` files are copied into Sierra Chart's Data Files Folder and opened as custom symbols like `tradester_ES`, which matches the existing repo notes.

## Best 3 Options

### 1. Prepared Chartbook + Write Bar Data to File Study

This is the simplest and probably the first thing to build.

Create a Sierra Chart chartbook with charts for `15s`, `5m`, `1d`, etc. Each chart uses the built-in **Write Bar Data to File** study. Sierra continuously writes loaded chart bars to text files. Our Node process watches file modification times, parses the output, and compares against our JSON bars.

Why this fits: Sierra's docs say this study writes Date-Time, OHLC, and Volume for the loaded chart bars, updates the file in real time, uses the chart timeframe, and writes to the Data Files Folder or a configured file path. It does not write the incomplete last bar, which is good for deterministic comparison.

Tradeoff: this validates regular chart bars, but not study-specific internals unless we add more export machinery.

### 2. ACSIL Custom Export Study

This is the most controlled and likely the long-term best validator.

We write a small Sierra ACSIL C++ study that runs inside Sierra, reads `sc.BaseDateTimeIn`, `sc.Open`, `sc.High`, `sc.Low`, `sc.Close`, `sc.Volume`, `sc.NumberOfTrades`, bid volume, ask volume, and any other fields we need, then writes a normalized CSV or JSON file. It can also write a "done" marker file after full recalculation.

Why this fits: ACSIL has direct access to chart bar arrays and file APIs. Sierra also exposes `sc.WriteBarAndStudyDataToFile()` if we want Sierra's built-in bar/study export format. This avoids guessing when the built-in study rewrote the file and lets us control headers, precision, UTC formatting, closed-bar policy, and metadata.

Tradeoff: this requires maintaining a tiny C++ DLL and a prepared chartbook/study setup. Sierra still needs to be running; there is no documented headless ACSIL runtime.

### 3. DTC Historical Price Data Server

Sierra can expose a DTC socket server. Our Node process connects to Sierra, requests historical records for a symbol with `RecordInterval` set to the target bar size, then compares the returned OHLCV records against our bars.

Why this fits: this is the cleanest process-to-process interface. Sierra documents a historical data port, default `11098`, and supports requesting intervals from tick-by-tick, where `RecordInterval` is `0`, up to daily seconds. WebSocket is also supported, though Sierra warns JSON is not recommended for large intraday downloads.

Tradeoff: DTC returns historical price records from Sierra's data files, but we should verify whether the returned bars match the exact chart configuration we care about, especially session times, chart bar settings, volume bars, range bars, and custom chart behavior. For plain time bars it may be excellent; for "what this chart displays" the file/ACSIL chart export is safer.

## Recommendation

Start with option 1 as the spike: prepared chartbook plus built-in **Write Bar Data to File** plus a Node file watcher/comparator. It is the smallest complete loop and directly validates Sierra's chart bars from our `.scid`.

Then move to option 2 if we need exact control or richer fields.

Treat option 3 as useful for automated time-bar checks, but not as the primary oracle until we prove its output matches the visible chart settings we care about.

## Sources

- [Exporting and Importing Intraday Data Files](https://www.sierrachart.com/index.php?page=doc%2FImportExport.html)
- [Write Bar Data to File](https://www.sierrachart.com/index.php?ID=182&page=doc%2FStudiesReference.php)
- [DTC Protocol Server](https://www.sierrachart.com/index.php?page=doc%2FDTCServer.php)
- [ACSIL overview](https://www.sierrachart.com/index.php?page=doc%2FAdvancedCustomStudyInterfaceAndLanguage.php)
- [ACSIL functions: WriteBarAndStudyDataToFile / file APIs](https://www.sierrachart.com/index.php?page=doc%2FACSIL_Members_Functions.html)
- [ACSIL arrays: chart bar data access](https://www.sierrachart.com/index.php?l=doc%2FACSIL_Members_Variables_And_Arrays.html)
- [Command Line Parameters](https://www.sierrachart.com/index.php?page=doc%2FCommandLineParameters.html)
