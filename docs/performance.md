# Performance

How fast the engine plays a season, how big a save gets, and how much memory a game holds, measured on the Mac the game is built on.

## Result

- **A season of the v1 world (1,344 clubs) takes a median of 3.29 s of CPU**, 3.73 s at worst over 15 seasons. Brazil's full tier alone takes 2.29 s; the 62 leagues abroad add the rest.
- **A season of a synthetic world of 4,509 clubs takes a median of 4.01 s of CPU**, 4.33 s at worst. The target in SPEC §13 is 30 s for 4,000 clubs, so the engine beats it by a factor of 7.5. Adding 3,165 clubs to the v1 world costs 0.72 s, because a club abroad draws only a score for each match.
- **A save of the v1 world is 4.2 MB after the first season and 7.7 MB after twenty**, written in 0.07 to 0.13 s and read back in 0.06 to 0.14 s. The 4,509-club world saves in 10.1 MB (150 shards).
- **Memory, seed 1 (the only clean rows):** the v1 world holds 51 to 58 MB of live data after a garbage collection and its process reaches 388 MB; the 4,509-club world holds 66 to 79 MB and its process 544 MB. By the fifth seed the process has grown to 544 MB and 674 MB (see Method).
- **The slowest single day takes 0.16 to 0.47 s of CPU** in the two worlds with a world abroad (a day on which the Brazilian rounds, the continental cups and the leagues abroad all play). The app plays days in a worker, so the screen does not freeze for it.

## Method

`pnpm perf:report --seeds 5 --seasons 3 --write docs/performance.md` fills the tables below (about five minutes). It runs `packages/engine/src/cli/perfReport.ts`:

- **Worlds.** Brazil alone (`loadNewGame` with no world); the v1 world as a player gets it (`v1WorldStart`: Brazil in the full tier, the leagues abroad result-only, the Club World Cup's guests); and the synthetic world (`syntheticWorldStart`), which clones the v1 world's leagues abroad three times with new ids (country `gb-eng-x1`, clubs `arsenal~1`, no UEFA or CONMEBOL places) until it holds at least 4,000 clubs. The clones exist only in the bench, never in game data. The bench checks that they play: over 15 seasons the clones finished 563,190 league matches and the real countries 187,730, three times as many for three copies.
- **Time.** `process.cpuUsage()` around each season, user plus system, the way the engine's own speed tests count (`cpuBudgetSeconds`). Other processes on a shared machine stretch a wall clock; they stretch CPU time much less. CPU time is higher than wall time here (3.29 s against 2.6 s for the v1 world) because V8's garbage collector and JIT compiler work on their own threads, and `cpuUsage` counts them.
- **Seeds.** Five seeds, three seasons each, with no human coach (the engine plays every club), from 1 January 2026.
- **Memory.** `heapUsed` after a forced garbage collection (`--expose-gc`) and `rss` at the end of each season. The harness keeps the first seed's last state for the save test, so only seed 1's heap rows are clean; later rows carry that state as well. `rss` does not shrink while the process lives, which is why it climbs from seed to seed.
- **Saves.** `saveShards` and `loadShards`, the functions the app's save files use, on the state after the first seed's third season. An autosave one day later passes the first save as its baseline, so only shards that changed are written. The save-growth table plays one v1 world for twenty seasons and saves at each season start.
- **Load on the machine.** The load average is printed at the start and the end of the run. This run started at 10.3 and ended at 4.2: other agents were working on the Mac. Two earlier runs of the same seeds gave medians of 3.06 s and 3.89 s for the v1 world and 3.91 s and 4.75 s for the 4,509-club world, at load averages of 2.6 and 5.5, so expect a spread of about a quarter between runs. Every run is far under the budget.

<!-- tables:start -->

Commit: c8666f2f.
Machine: Apple M4 Pro, 12 cores, node v22.22.2. Load average at start (1, 5, 15 min): 10.3, 11.1, 9.0.
Reference workload (`cpuBudgetSeconds`): this machine ran it 1.00 times the 0.065 s of the machine the budgets were set on (1.00 means as fast or faster).

## Season CPU

### Brazil alone, the full tier without the world abroad

281 clubs, 7197 players in the full tier. Setup (building the world): 0.10 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 3.40 | 1.92 | 211 | 39.2 | 261.4 |
| 1 | 2027 | 3.00 | 1.88 | 196 | 48.8 | 304.2 |
| 1 | 2028 | 2.54 | 1.84 | 165 | 43.5 | 332.6 |
| 2 | 2026 | 2.45 | 1.70 | 173 | 57.1 | 338.2 |
| 2 | 2027 | 2.50 | 1.84 | 245 | 61.1 | 349.6 |
| 2 | 2028 | 2.29 | 1.84 | 160 | 55.5 | 353.5 |
| 3 | 2026 | 1.96 | 1.62 | 137 | 64.9 | 354.9 |
| 3 | 2027 | 2.23 | 1.83 | 150 | 65.7 | 360.0 |
| 3 | 2028 | 2.49 | 1.83 | 177 | 67.9 | 362.3 |
| 4 | 2026 | 2.26 | 1.73 | 133 | 65.6 | 363.0 |
| 4 | 2027 | 2.57 | 1.88 | 145 | 66.4 | 363.2 |
| 4 | 2028 | 2.24 | 1.86 | 168 | 68.1 | 363.5 |
| 5 | 2026 | 2.09 | 1.71 | 154 | 66.2 | 363.7 |
| 5 | 2027 | 2.18 | 1.82 | 137 | 66.7 | 363.5 |
| 5 | 2028 | 2.22 | 1.86 | 139 | 68.4 | 363.7 |

League matches played abroad in the 15 seasons run: 0 in the real countries, 0 in cloned ones (finished league seasons only).

Median season: **2.29 s CPU**; slowest 3.40 s; first season of each seed, median 2.26 s.

### The v1 world

1344 clubs, 7197 players in the full tier. Setup (building the world): 0.18 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 3.73 | 2.31 | 217 | 50.9 | 387.9 |
| 1 | 2027 | 3.51 | 2.59 | 239 | 54.6 | 387.1 |
| 1 | 2028 | 3.32 | 2.60 | 206 | 57.6 | 387.8 |
| 2 | 2026 | 2.86 | 2.23 | 265 | 74.1 | 412.9 |
| 2 | 2027 | 3.64 | 2.64 | 237 | 77.3 | 432.5 |
| 2 | 2028 | 3.47 | 2.75 | 225 | 79.5 | 445.0 |
| 3 | 2026 | 2.90 | 2.28 | 217 | 97.1 | 447.9 |
| 3 | 2027 | 3.27 | 2.62 | 297 | 99.9 | 529.4 |
| 3 | 2028 | 3.57 | 2.71 | 380 | 101.8 | 541.4 |
| 4 | 2026 | 2.73 | 2.27 | 188 | 97.0 | 542.8 |
| 4 | 2027 | 2.99 | 2.55 | 177 | 101.0 | 543.3 |
| 4 | 2028 | 3.29 | 2.69 | 360 | 111.2 | 544.2 |
| 5 | 2026 | 2.75 | 2.24 | 160 | 97.4 | 544.0 |
| 5 | 2027 | 3.10 | 2.58 | 195 | 100.3 | 543.8 |
| 5 | 2028 | 3.58 | 2.73 | 331 | 102.9 | 544.9 |

League matches played abroad in the 15 seasons run: 187730 in the real countries, 0 in cloned ones (finished league seasons only).

Median season: **3.29 s CPU**; slowest 3.73 s; first season of each seed, median 2.86 s.

### A synthetic world of at least 4000 clubs

4509 clubs, 7197 players in the full tier. Setup (building the world): 0.28 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 4.01 | 2.89 | 265 | 66.5 | 544.3 |
| 1 | 2027 | 4.32 | 3.50 | 294 | 74.8 | 544.2 |
| 1 | 2028 | 4.21 | 3.46 | 266 | 78.8 | 544.1 |
| 2 | 2026 | 3.48 | 2.89 | 364 | 102.6 | 545.5 |
| 2 | 2027 | 4.01 | 3.29 | 261 | 111.6 | 545.9 |
| 2 | 2028 | 4.07 | 3.41 | 245 | 115.4 | 546.0 |
| 3 | 2026 | 3.16 | 2.66 | 219 | 139.8 | 562.1 |
| 3 | 2027 | 3.91 | 3.33 | 389 | 147.3 | 637.3 |
| 3 | 2028 | 3.78 | 3.29 | 303 | 151.9 | 673.9 |
| 4 | 2026 | 3.46 | 2.72 | 234 | 139.8 | 674.0 |
| 4 | 2027 | 4.15 | 3.43 | 223 | 147.7 | 673.8 |
| 4 | 2028 | 4.08 | 3.38 | 436 | 151.3 | 673.8 |
| 5 | 2026 | 3.34 | 2.71 | 214 | 139.7 | 674.0 |
| 5 | 2027 | 4.05 | 3.40 | 234 | 148.0 | 674.3 |
| 5 | 2028 | 4.33 | 3.47 | 472 | 151.7 | 674.5 |

League matches played abroad in the 15 seasons run: 187730 in the real countries, 563190 in cloned ones (finished league seasons only).

Median season: **4.01 s CPU**; slowest 4.33 s; first season of each seed, median 3.46 s.

## Save size, load and autosave

First save of the world after its first season, then loaded back, then one day later saved again with the first save as the baseline (only the shards that changed are written).

| World | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |
|---|---|---|---|---|---|---|
| Brazil alone, the full tier without the world abroad | 5.3 | 1 | 0.04 | 0.04 | 5.3 | 0.02 |
| The v1 world | 4.8 | 39 | 0.12 | 0.10 | 4.3 | 0.08 |
| A synthetic world of at least 4000 clubs | 10.1 | 150 | 0.15 | 0.13 | 8.2 | 0.10 |

## Save size by season, the v1 world, seasons 1 to 20

| Season start | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |
|---|---|---|---|---|---|---|
| 2027 | 4.2 | 39 | 0.07 | 0.06 | 3.8 | 0.07 |
| 2028 | 4.5 | 39 | 0.08 | 0.07 | 4.0 | 0.06 |
| 2029 | 4.8 | 39 | 0.08 | 0.07 | 4.3 | 0.08 |
| 2030 | 5.0 | 39 | 0.08 | 0.08 | 4.5 | 0.07 |
| 2031 | 5.3 | 39 | 0.09 | 0.08 | 4.8 | 0.08 |
| 2032 | 5.5 | 39 | 0.09 | 0.09 | 5.0 | 0.08 |
| 2033 | 5.7 | 39 | 0.10 | 0.10 | 5.1 | 0.08 |
| 2034 | 5.9 | 39 | 0.10 | 0.11 | 5.3 | 0.09 |
| 2035 | 6.0 | 39 | 0.11 | 0.11 | 5.5 | 0.10 |
| 2036 | 6.2 | 39 | 0.11 | 0.12 | 5.6 | 0.09 |
| 2037 | 6.4 | 39 | 0.11 | 0.12 | 5.8 | 0.10 |
| 2038 | 6.5 | 39 | 0.12 | 0.12 | 5.9 | 0.10 |
| 2039 | 6.6 | 39 | 0.11 | 0.12 | 6.1 | 0.10 |
| 2040 | 6.8 | 39 | 0.12 | 0.13 | 6.2 | 0.10 |
| 2041 | 7.0 | 39 | 0.12 | 0.12 | 6.4 | 0.11 |
| 2042 | 7.1 | 39 | 0.12 | 0.13 | 6.5 | 0.10 |
| 2043 | 7.3 | 39 | 0.13 | 0.13 | 6.7 | 0.11 |
| 2044 | 7.4 | 39 | 0.13 | 0.13 | 6.8 | 0.12 |
| 2045 | 7.6 | 39 | 0.13 | 0.13 | 7.0 | 0.11 |
| 2046 | 7.7 | 39 | 0.13 | 0.14 | 7.1 | 0.12 |

Load average at the end: 4.2, 8.2, 8.2.

<!-- tables:end -->

## What the numbers do not say

- They come from Node on a Mac. The app runs the same engine in a worker inside Tauri's web view (WebKit on macOS, WebView2 on Windows), which has its own JIT and memory rules. Windows is measured on `casa` in ticket X1.
- A game with a human coach abroad plays that country's leagues in the full tier, which costs about as much as Brazil's (2.29 s for 281 clubs). The 4,509-club world keeps Brazil as the only full-tier country, as a new game does.
- Season 1 is faster than the later seasons in the v1 world (a median of 2.86 s against 3.29 s overall). Later seasons carry transfers and a longer history, which probably explains it; the bench does not isolate the cause.
