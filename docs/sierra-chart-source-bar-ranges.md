# Sierra Chart Source Bar Ranges

These ranges come from the generated source CSV files in `data-in/ES`. Sierra chart date settings must fully include the matching range for each chart before running `test:e2e:sierra`.

| Chart      | Source file                  |   Rows | First time ms | First bar time (Chicago) |  Last time ms | Last bar time (Chicago) | Sierra start date | Sierra end date |
| ---------- | ---------------------------- | -----: | ------------: | ------------------------ | ------------: | ----------------------- | ----------------- | --------------- |
| 1 Sec      | `tradester_ES_1s_pl0.25.csv` | 300000 | 1777240800000 | 2026-04-26 17:00:00      | 1780693191000 | 2026-06-05 15:59:51     | 2026-04-26        | 2026-06-05      |
| 15 Sec     | `tradester_ES_15s.csv`       |  20000 | 1780382400000 | 2026-06-02 01:40:00      | 1780693185000 | 2026-06-05 15:59:45     | 2026-06-02        | 2026-06-05      |
| 500 Volume | `tradester_ES_500v.csv`      |  20000 | 1775147031719 | 2026-04-02 11:23:51      | 1780693117199 | 2026-06-05 15:58:37     | 2026-04-02        | 2026-06-05      |
| 5 Min      | `tradester_ES_5m.csv`        |  20000 | 1772018400000 | 2026-02-25 05:20:00      | 1780692900000 | 2026-06-05 15:55:00     | 2026-02-25        | 2026-06-05      |
| 1 Day      | `tradester_ES_1d.csv`        |  20000 |             0 | 1969-12-31 18:00:00      | 1780610400000 | 2026-06-04 17:00:00     | 1969-12-31        | 2026-06-04      |

Note: the `1 Day` source file currently starts at Unix epoch time `0`; Sierra must include that date to cover the full source file exactly, or we need to fix/regenerate the daily source bars before using that chart for strict full-range validation.
