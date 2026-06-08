# Questions

## Does Sierra Chart ACSIL allow automating export of bar data or bar and study data to a text file?

Yes. ACSIL can add a custom right-click menu command and handle it with `sc.MenuEventID`. From that command, write the desired bar/study data yourself, or use Sierra Chart's bar-and-study export/write APIs where they fit.

## Can Sierra Chart ACSIL automate importing generated CSV intraday data?

Not directly through a documented ACSIL command. Sierra Chart supports manual `Edit >> Import and Load Intraday Data`; for automation, generate valid data and write/append to Sierra Chart's intraday data file format, then reload/recalculate the chart.

## Does Sierra Chart bar import support tick-based data and then displaying 5-minute bars?

Yes. Sierra Chart Text/CSV intraday records can represent single ticks. After importing them into Sierra Chart's intraday `.scid` format, you can open the intraday chart and set the chart bar period to 5 minutes.

## How do Sierra Chart `.scid` storage bars differ from `.dly` bars?

`.scid` files store intraday data in Sierra Chart's binary format; records can be ticks or time periods up to one day. `.dly` files store Historical Daily chart data as text/CSV records, mainly for daily-or-higher bars.

## Why do 1-day Sierra Chart bars built from `.scid` files differ from `.dly` files?

`.scid` 1-day bars are aggregated from intraday records using chart session times, time zone, and available intraday data. `.dly` bars come from Historical Daily data, often exchange/data-service daily bars with official settlement behavior.

## For ES `.scid` 1-day bars, what chart settings best match the `.dly` 1-day file?

Use an Intraday chart, set Chart Data Type to Intraday Chart Only, Bar Period to 1-0-0, and use full-session ES session times. This can match high/low/volume, but `.dly` closes may still differ because futures daily closes often use settlement.

## Why are my current ES `.scid` 1-day settings still not matching `.dly`?

Set Chart Data Type to Intraday Chart Only and use ES full-session times with the maintenance break excluded. In Central time, try day 08:30-15:59:59 and evening 17:00-08:29:59. `.dly` close may still differ because of settlement.

## When importing bars, can I use a 5-minute main chart with a 20-day SMA?

Yes. Keep the main chart at 5 minutes, create a separate daily chart with a 20-period SMA, then overlay that SMA onto the 5-minute chart using Sierra Chart's Study/Price Overlay study.

## Can ACSIL use a 20-day SMA while the main chart is 5 minutes?

Yes. Put the 20-period SMA on a separate daily chart, then have the 5-minute ACSIL study read that study's subgraph using cross-chart study access, such as `sc.GetStudyArraysFromChartUsingID`.

## Can we write generated bars directly to Sierra Chart `.scid` instead of CSV?

Yes. Generated intraday bars can be written directly to Sierra Chart's binary `.scid` format if the header and `s_IntradayRecord` structures are correct. This avoids CSV import, but requires exact file-format handling.

## Can a custom Sierra Chart symbol use existing symbol settings like tick size?

Yes. Add or duplicate a Global Symbol Settings entry for the custom symbol, or create a matching symbol pattern. Set Tick Size, Price Display Format, Currency Value Per Tick, and session times to match the real Sierra symbol.

## Can Sierra Chart custom studies run headless or through a CLI without opening Sierra Chart?

No documented headless ACSIL runtime exists. Custom studies run inside Sierra Chart on charts/chartbooks. You can automate some actions from ACSIL, hide charts, or control replay from a study, but Sierra Chart still needs to be running.
