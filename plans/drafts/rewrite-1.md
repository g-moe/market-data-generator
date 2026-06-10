Use tmux to connect to market session, we are ssh'd into the windows machine. I realized an better way to do this. We can start from a full rewrite if that means you will properly cleanup/know what debt to remove. I am going to give the high-level happy/easier path then you need to look at our existing code and see all the edge cases or fill in with specifics or tests.

Part 1: generate:without nothing changes

Part 1.5: crafting proper .cpp file
Important:

- be sure to craft the .cpp file carefully...think about what you are actually doing the script is not a single run...the cpp/script runs on a chart series loop in a scripting language and you made it continously reload for each tick. we only need to call the write to file operation once. You also need to be careful that you dont write globals that are shared between two charts that have the same script open because they will fight.

The cpp file in order to allow for better experience needs to do these things. They can all be managed in ascil.

1.  Do once

- change symbol (comes from symbol arg)
- change to correct tickSize (comes from symbol config)
- change to correct start-end date (comes from the specific timeframe .csv file, we will likely need a switch statement inside the cpp file similar to how we do the file naming)

2.  Then once history is done loading, write the bars out to file

Part 2: genearte:sierra

- 1.  This script requires that there is already data in `data-in/symbol` for the symbol that we want, if there isnt we hard fail and tell the user what command to run.
- 2.  If sierra is open on windows machine close it.
- TODO - edit the cpp (this might want to be hardcoded)
- 3.  Move the tradester_sync_bridge.cpp into the sierra directory under the ACS_Source dir
- 4.  Compile/Build the .cpp file, it should be in the sierra directory under the Data dir
- 5.  Copy over the generated .scid file into the sierra directory under the Data dir - this should be a hard replace
- 6.  Copy over the `!tradester.cht` file into the sierra directory under the Data Dir
- 7.  Warn the user that the script will fail if they do not have this setting enabled on Sierra `General Settings >> Startup >> Open Files on Startup >> YES & !tradester.Cht as a file to open on startup`
- 8.  Open sierra (file path is hardcoded)
- 9.  Wait for max 60seconds to receive data inside `data-temp/{symbol}` (on each run at the start delete whatever was previously in that directory, no longer use latest, no longer delete ENTIRE dir). Make sure that files are done being written to.
- 10. After we receive data for each timeframe that we want.
  - compare each bar of the sierra data to our .csv data. we are just comparing ohlcv, if any bars do not match we hard fail...as we are looping through each bar we are making our new `data-out/symbol/filename.csv` which takes our csv data and appends on the sierra datas columns/fields that have `tradester_` prefix

Rules.
Keep each part isolated. Keep each part decoupled. Still follow test-driven development with unit tests. Full runs for the commands should have end-to-end tests.

We only have the one CLI arg or symbol. Everything else uses a hard-coded constant. Do not add defaults like fallbacks and optionals and sends that is in your personality and you tend to lean on.

For each step, be sure you log out to the console. It doesn't need to be too verbose, but just major things that lets the user know what step you're on.
