# Questions

## Does Sierra Chart ACSIL allow automating export of bar data or bar and study data to a text file?

Yes. ACSIL can add a custom right-click menu command and handle it with `sc.MenuEventID`. From that command, write the desired bar/study data yourself, or use Sierra Chart's bar-and-study export/write APIs where they fit.

## Can Sierra Chart ACSIL automate importing generated CSV intraday data?

Not directly through a documented ACSIL command. Sierra Chart supports manual `Edit >> Import and Load Intraday Data`; for automation, generate valid data and write/append to Sierra Chart's intraday data file format, then reload/recalculate the chart.
