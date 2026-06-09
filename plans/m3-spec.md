We have the generation running in windows. in this windows vm we have sierra chart running. We are now going to implement milestone 3.

Milestone 3 End Goal Flow:
1. run generation script.
2. after generation we tell sierra to reload charts
3. sierra reloads the charts and exports bar AND study data to csv file
4. for each of our derived bars we calculated from the 1t data, we loop through the sierra bars until we get to the start of our derived bars...then we compare the `Open, High, Low, Close, Volume` of our derived bars to sierras output bars. We ignore the study data that will be used in another context and is not relevant...we only look at the columns I defined.
TLDR: our bars OHLCV === sierra bars OHLCV
5. If any of the bars do not match we must throw an error
6. Grab the sierra .txt files from the sierra data folder and transform to write to `data-out`...we need toi canonicalize the sierra bar data to OUR shape we just append the columns with `tradester_` prefix to our data...it is probably best to do this step within step4 when we are validating that way we dont need to loop through twice. Sample tradester_ columns being `tradester_indicatorId1, tradester_indicatorId2`. Canonicalize probably isnt the right word, we just use OUR bar data and append the sierra columns with tradester_ prefix if the sierra bars and our bars OHLCV are equal.

Mile stone 3 In-depth:
1. run sierra-sync
- uses current generation code (composed+decoupled)
- uses same args / code for cli entry + without-cli entry
- does not replace current generation package.json commands

2. ensure sierra reloads its charts with the new .scid file
- details not clear: rough sketch below
- after generation we recursively check for 60seconds if sierra has written new .txt files based on the files last modified date. we make sure that we have an output file for each of our csv files (1sec, 15sec, 5min, 500v, 1d).
- if we have all files we can move on; otherwise we hard fail

3. For each file we need to loop through the sierra .txt output and compare to our .csv file
Sample Loop for file1:
- idx 0 check if the sierra timestamp is the first bar in our .csv data. If no we continue, If yes we start comparing and set a flag that we are now in compare mode.
Comparing:
- We compare only `Open, High, Low, Close, Volume` values, if sierra !== ours we hard fail with a good descriptive message of the two files we compared and the unixMs in our bars and the date time in siera
- Hard fail:
  - we never reach compare mode
  - a bar mismatch

4. Writing to `data-output/${user-cli-arg}`




Requirements:
- **New flow should be isolate and not affect our candle-generation. Keep the sierra-specific stuff in its own files. We should be able to run generation in isolation. This means the sierra-specific stuff consumes the generation function.**
  - New file structure:
  - src/
     - /md-generation (currently domain)
     - /sierra-sync (not written yet)
     - /shared
       - /cli
       - /io
     - /contracts (mirrors /src, so md-generation specific go in contracts/md-generation, sierra-sync specific go in contracts/sierra-sync, shared go in contracts/shared
  - We should have with and without cli for...both should have the same args and can share code
    1. md-generation
    2. sierra-sync 

- ** This is a major milestone; rewrites encouraged, removing debt encouraged, maintain DRY principles required; testing high-signal+covered

- **Use TDD; our testing strategy should follow our sample flow/checkpoints we have listed in this document. We test logic with unit tests, but we should build with an integration test that runs the full thing in a stepped manner. Follow the existing pattern for integration tests that we used for the current generation stuff**

- **Normal generation should write data to `data-in`**

- **Sierra-sync should write data to `data-out`**


Context:
- sierra data directory: "C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\Data"
- dev sierra script stuff for simulated (HMR), there might be some good resource in here that help build towards our end goal so it is worth a sub-agent to search through while you are turning this spec into a plan: "C:\Trading Software\DEV-Sierra-Chart\Sierra Chart\DEV - SC"

Milestone checkpoints:
1. running sierra-sync, generates data, and forces sierra to reload
2. after reload we correctly identify when the sierra chart has written the new data to its .txt file
3. we make sure our OHLCV bars for 1sec match sierra OHLCV bars
4. make sure other bars match (15sec, 5min, 500v, 1d)

Sample Sierra Data:
filename example: `tradester_ES[M]  1 Sec  #1_GraphData.txt`
```txt
Header:Date, Time, Open, High, Low, Last, Volume, # of Trades, OHLC Avg, HLC Avg, HL Avg, Bid Volume, Ask Volume, tradester_indicatorId1, tradester_indicatorId2, tradester_inidcatorIdEtc...
Row1:
Row2:
etc
```

Our Sample Data:
filename example: `tradester_ES_1s_pl0.25.csv` | `tradester_ES_5m.csv`
```csv
Header: id, time, pos, open, high, low, close, volume, bidVolume, askVolume, vwap
Row1:
Row2:
etc
```

Again we only compare `Open, High, Low, Close, Volume` and the id or index if the timestamp used for comparison...basically as we are looping through the sierra bars...if we are before our sample data start, its just a noOp/skip. ONLY when we detect the start of our bars do we make sure bar for bar matches and is in order.

