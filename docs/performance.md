# Performance

How fast the engine plays a season, how big a save gets, and how much memory a game holds, measured on the Mac the game is built on.

## Result

- **A season of the v1 world (1,344 clubs) takes a median of 3.06 s of CPU**, 3.52 s at worst over 15 seasons. Brazil's full tier alone takes 2.17 s; the 62 leagues abroad add the rest.
- **A season of a synthetic world of 4,509 clubs takes a median of 3.91 s of CPU**, 4.19 s at worst. The target in SPEC §13 is 30 s for 4,000 clubs, so the engine beats it by a factor of 7.7. Adding 3,165 clubs to the v1 world costs 0.85 s, because a club abroad draws only a score for each match.
- **A save of the v1 world is 4.2 MB after the first season and 7.8 MB after twenty**, written in 0.08 to 0.15 s and read back in about the same time. The 4,509-club world saves in 10.1 MB (150 shards).
- **Memory, seed 1 (the only clean rows):** the v1 world holds 51 to 57 MB of live data after a garbage collection and its process reaches 391 MB; the 4,509-club world holds 66 to 78 MB and its process 547 MB. By the fifth seed the process has grown to 546 MB and 682 MB (see Method).
- **The slowest single day takes 0.14 to 0.34 s of CPU** (a day on which the Brazilian rounds, the continental cups and the leagues abroad all play). The app plays days in a worker, so the screen does not freeze for it.

## Method

`pnpm perf:report --seeds 5 --seasons 3 --write docs/performance.md` fills the tables below (about five minutes). It runs `packages/engine/src/cli/perfReport.ts`:

- **Worlds.** Brazil alone (`loadNewGame` with no world); the v1 world as a player gets it (`v1WorldStart`: Brazil in the full tier, the leagues abroad result-only, the Club World Cup's guests); and the synthetic world (`syntheticWorldStart`), which clones the v1 world's leagues abroad three times with new ids (country `gb-eng-x1`, clubs `arsenal~1`, no UEFA or CONMEBOL places) until it holds at least 4,000 clubs. The clones exist only in the bench, never in game data. The bench checks that they play: over 15 seasons the clones finished 563,190 league matches and the real countries 187,730, three times as many for three copies.
- **Time.** `process.cpuUsage()` around each season, user plus system, the way the engine's own speed tests count (`cpuBudgetSeconds`). Other processes on a shared machine stretch a wall clock; they stretch CPU time much less. CPU time is higher than wall time here (3.06 s against 2.4 s for the v1 world) because V8's garbage collector and JIT compiler work on their own threads, and `cpuUsage` counts them.
- **Seeds.** Five seeds, three seasons each, with no human coach (the engine plays every club), from 1 January 2026.
- **Memory.** `heapUsed` after a forced garbage collection (`--expose-gc`) and `rss` at the end of each season. The harness keeps the first seed's last state for the save test, so only seed 1's heap rows are clean; later rows carry that state as well. `rss` does not shrink while the process lives, which is why it climbs from seed to seed.
- **Saves.** `saveShards` and `loadShards`, the functions the app's save files use, on the state after the first seed's third season. An autosave one day later passes the first save as its baseline, so only shards that changed are written. The save-growth table plays one v1 world for twenty seasons and saves at each season start.
- **Load on the machine.** The load average is printed at the start and the end of the run. This run started at 2.6 and ended at 3.2, with other work going on. An earlier run of the same seeds on a busier Mac (load average 5 to 9) gave a median of 3.89 s for the v1 world and 4.75 s for the 4,509-club world, so expect a spread of about a quarter between a quiet and a busy machine. Both runs are far under the budget.

<!-- tables:start -->

Machine: Apple M4 Pro, 12 cores, node v22.22.2. Load average at start (1, 5, 15 min): 2.6, 5.1, 6.9.
Reference workload (`cpuBudgetSeconds`): this machine ran it 1.00 times the 0.065 s of the machine the budgets were set on (1.00 means as fast or faster).

## Season CPU

### Brazil alone, the full tier without the world abroad

281 clubs, 7197 players in the full tier. Setup (building the world): 0.10 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 3.15 | 1.75 | 196 | 39.2 | 261.4 |
| 1 | 2027 | 2.81 | 1.72 | 192 | 41.0 | 301.1 |
| 1 | 2028 | 2.42 | 1.68 | 149 | 43.3 | 309.2 |
| 2 | 2026 | 2.45 | 1.55 | 166 | 52.2 | 341.4 |
| 2 | 2027 | 2.18 | 1.68 | 151 | 53.1 | 332.9 |
| 2 | 2028 | 2.14 | 1.65 | 159 | 55.0 | 334.7 |
| 3 | 2026 | 1.83 | 1.50 | 120 | 64.5 | 348.1 |
| 3 | 2027 | 2.17 | 1.68 | 151 | 65.6 | 358.3 |
| 3 | 2028 | 2.34 | 1.67 | 164 | 67.5 | 364.4 |
| 4 | 2026 | 2.03 | 1.53 | 123 | 65.3 | 366.7 |
| 4 | 2027 | 2.35 | 1.73 | 140 | 65.9 | 366.6 |
| 4 | 2028 | 2.01 | 1.63 | 134 | 67.7 | 366.9 |
| 5 | 2026 | 1.93 | 1.50 | 149 | 65.7 | 366.8 |
| 5 | 2027 | 1.94 | 1.61 | 129 | 66.2 | 366.6 |
| 5 | 2028 | 2.02 | 1.66 | 136 | 68.0 | 366.8 |

League matches played abroad in the 15 seasons run: 0 in the real countries, 0 in cloned ones (finished league seasons only).

Median season: **2.17 s CPU**; slowest 3.15 s; first season of each seed, median 2.03 s.

### The v1 world

1344 clubs, 7197 players in the full tier. Setup (building the world): 0.17 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 3.52 | 2.13 | 201 | 50.7 | 390.8 |
| 1 | 2027 | 3.17 | 2.35 | 218 | 54.2 | 390.7 |
| 1 | 2028 | 3.09 | 2.42 | 207 | 57.4 | 392.1 |
| 2 | 2026 | 2.95 | 2.08 | 310 | 73.7 | 422.4 |
| 2 | 2027 | 3.16 | 2.37 | 341 | 77.3 | 433.1 |
| 2 | 2028 | 3.06 | 2.47 | 176 | 79.2 | 457.0 |
| 3 | 2026 | 2.59 | 2.03 | 144 | 96.7 | 459.0 |
| 3 | 2027 | 3.06 | 2.46 | 308 | 99.4 | 534.2 |
| 3 | 2028 | 3.08 | 2.44 | 229 | 101.5 | 536.3 |
| 4 | 2026 | 2.60 | 2.07 | 163 | 96.4 | 536.1 |
| 4 | 2027 | 2.94 | 2.41 | 321 | 100.3 | 537.0 |
| 4 | 2028 | 3.33 | 2.49 | 318 | 101.6 | 544.9 |
| 5 | 2026 | 2.49 | 2.04 | 149 | 97.2 | 545.3 |
| 5 | 2027 | 2.92 | 2.43 | 186 | 100.1 | 545.2 |
| 5 | 2028 | 3.01 | 2.50 | 197 | 102.8 | 545.7 |

League matches played abroad in the 15 seasons run: 187730 in the real countries, 0 in cloned ones (finished league seasons only).

Median season: **3.06 s CPU**; slowest 3.52 s; first season of each seed, median 2.60 s.

### A synthetic world of at least 4000 clubs

4509 clubs, 7197 players in the full tier. Setup (building the world): 0.27 s CPU, median of 5.

| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |
|---|---|---|---|---|---|---|
| 1 | 2026 | 3.90 | 2.68 | 276 | 66.2 | 547.1 |
| 1 | 2027 | 3.93 | 3.22 | 253 | 74.4 | 546.6 |
| 1 | 2028 | 4.06 | 3.31 | 252 | 78.4 | 546.5 |
| 2 | 2026 | 3.18 | 2.64 | 224 | 102.7 | 548.1 |
| 2 | 2027 | 4.19 | 3.49 | 274 | 111.2 | 548.3 |
| 2 | 2028 | 4.06 | 3.38 | 251 | 115.1 | 548.4 |
| 3 | 2026 | 3.15 | 2.63 | 225 | 139.4 | 550.1 |
| 3 | 2027 | 3.77 | 3.26 | 258 | 146.8 | 642.5 |
| 3 | 2028 | 4.04 | 3.30 | 244 | 151.6 | 643.6 |
| 4 | 2026 | 3.22 | 2.67 | 216 | 139.8 | 643.3 |
| 4 | 2027 | 4.11 | 3.41 | 252 | 147.7 | 681.5 |
| 4 | 2028 | 3.74 | 3.28 | 239 | 151.4 | 681.4 |
| 5 | 2026 | 3.42 | 2.70 | 193 | 139.2 | 681.9 |
| 5 | 2027 | 3.91 | 3.35 | 239 | 148.2 | 682.2 |
| 5 | 2028 | 3.93 | 3.42 | 258 | 151.8 | 682.1 |

League matches played abroad in the 15 seasons run: 187730 in the real countries, 563190 in cloned ones (finished league seasons only).

Median season: **3.91 s CPU**; slowest 4.19 s; first season of each seed, median 3.22 s.

## Save size, load and autosave

First save of the world after its first season, then loaded back, then one day later saved again with the first save as the baseline (only the shards that changed are written).

| World | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |
|---|---|---|---|---|---|---|
| Brazil alone, the full tier without the world abroad | 5.3 | 1 | 0.03 | 0.04 | 5.3 | 0.02 |
| The v1 world | 4.8 | 39 | 0.11 | 0.09 | 4.3 | 0.07 |
| A synthetic world of at least 4000 clubs | 10.1 | 150 | 0.14 | 0.13 | 8.2 | 0.10 |

## Save size by season, the v1 world, seasons 1 to 20

| Season start | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |
|---|---|---|---|---|---|---|
| 2027 | 4.2 | 39 | 0.07 | 0.07 | 3.8 | 0.07 |
| 2028 | 4.5 | 39 | 0.08 | 0.07 | 4.1 | 0.06 |
| 2029 | 4.8 | 39 | 0.08 | 0.07 | 4.3 | 0.07 |
| 2030 | 5.1 | 39 | 0.09 | 0.08 | 4.6 | 0.10 |
| 2031 | 5.3 | 39 | 0.09 | 0.08 | 4.8 | 0.08 |
| 2032 | 5.5 | 39 | 0.09 | 0.09 | 5.0 | 0.08 |
| 2033 | 5.7 | 39 | 0.10 | 0.09 | 5.2 | 0.08 |
| 2034 | 5.9 | 39 | 0.10 | 0.10 | 5.3 | 0.08 |
| 2035 | 6.0 | 39 | 0.11 | 0.10 | 5.5 | 0.09 |
| 2036 | 6.2 | 39 | 0.11 | 0.11 | 5.7 | 0.09 |
| 2037 | 6.4 | 39 | 0.11 | 0.11 | 5.8 | 0.09 |
| 2038 | 6.5 | 39 | 0.12 | 0.12 | 6.0 | 0.10 |
| 2039 | 6.7 | 39 | 0.12 | 0.12 | 6.1 | 0.10 |
| 2040 | 6.8 | 39 | 0.13 | 0.13 | 6.3 | 0.10 |
| 2041 | 7.0 | 39 | 0.13 | 0.13 | 6.5 | 0.11 |
| 2042 | 7.2 | 39 | 0.13 | 0.14 | 6.6 | 0.11 |
| 2043 | 7.3 | 39 | 0.13 | 0.14 | 6.7 | 0.11 |
| 2044 | 7.5 | 39 | 0.13 | 0.14 | 6.9 | 0.12 |
| 2045 | 7.6 | 39 | 0.13 | 0.13 | 7.1 | 0.11 |
| 2046 | 7.8 | 39 | 0.14 | 0.15 | 7.2 | 0.11 |

Load average at the end: 3.2, 4.4, 6.3.

<!-- tables:end -->

## What the numbers do not say

- They come from Node on a Mac. The app runs the same engine in a worker inside Tauri's web view (WebKit on macOS, WebView2 on Windows), which has its own JIT and memory rules. Windows is measured on `casa` in ticket X1.
- A game with a human coach abroad plays that country's leagues in the full tier, which costs about as much as Brazil's (2.17 s for 281 clubs). The 4,509-club world keeps Brazil as the only full-tier country, as a new game does.
- Season 1 is faster than seasons 2 and 3 in the v1 world (2.60 s against about 3.0 s). Later seasons carry transfers and a longer history, which probably explains it; the bench does not isolate the cause.
