<img src="assets/logo.svg" width="96" alt="Boleiro logo">

# Boleiro

A Brazilian football manager game in the spirit of Brasfoot: simple to pick up, with real players, realistic money and match odds that behave like real football. You play as the coach.

## Data

`data/clubs.csv` lists every club of Série A–D 2026 plus every club that only plays its 2026 state championship: stadium, capacity, pitch, colours and fanbase. `data/crests.csv` points each club to its crest images in `assets/crests/`. `data/players.csv` holds every squad with a computed 1–99 strength, linked to its club by `club_id`. `data/SOURCES.md` names the source of every derived value. To rebuild both:

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/scrape_tm.py data/transfermarkt-players.csv   # squads and market values (Transfermarkt), cached in data/tm_cache
pipeline/fetch_sofascore.sh data/sofascore-stats.json                     # season stats (Sofascore), needs agent-browser
.venv/bin/python pipeline/fetch_wiki_colours.py data/transfermarkt-players.csv data/wiki-colours.csv   # kit colours (Wikidata + pt.wikipedia)
.venv/bin/python pipeline/build_clubs.py data/club-facts.csv data/wiki-colours.csv data/clubs.csv
.venv/bin/python pipeline/fetch_crests.py   # crests into assets/crests/ and data/crests.csv (Transfermarkt + ESPN), needs oxipng
.venv/bin/python pipeline/rate_players.py data/transfermarkt-players.csv data/sofascore-stats.json data/clubs.csv data/players.csv
```

`data/club-facts.csv` holds hand-checked values (artificial pitches, fanbase survey shares, short names) that override or fill the scraped ones.

Strength starts from a division baseline and moves with each player's own evidence: market value, share of minutes, Sofascore rating and, for forwards, goals and assists per 90. Players with little data stay near the baseline.

`data/history/brasileirao-serie-a-odds.csv` has Série A results since 2012 with closing betting odds, from football-data.co.uk. The match engine is calibrated against it, against the Série B–D results below, and against Copa do Brasil matches between divisions.

The rest of `data/history/` holds Copa do Brasil and Série B–D results from two sources, one folder each with the same columns:

- `sofascore/`: 2024 only, the season fetched before Sofascore's Cloudflare captcha blocked us. It is the only source with Série D, and its cup rows have closing 1X2 odds (119 of 122). Série B–D rows have no odds: Sofascore serves them one request per match and rate-limits hard, and calibrating home advantage and goals per game only needs results.
- `espn/`: every other season from ESPN's public API, 2015–2026 for the cup and Série B, 2017–2025 for Série C (ESPN has nothing earlier). No odds and no Série D.
- `divisions.csv` in each folder: the division every team played each season, from that season's standings, so a cup tie can be labelled "A vs D". ESPN only knows A–C, so in ESPN seasons a cup team without a division is Série D or below.

Each file has one row per finished match: date, round, source team ids and names, a normalized `*_key` for joining across sources, the score without any shootout, the shootout winner (`home`/`away`) and the odds columns. Série A odds come from football-data.co.uk (above). 2026 only has the matches finished when fetched.

`packages/data/src/history.ts` loads them (`loadResults`, `loadDivisions`); a season both sources cover comes from Sofascore. To rebuild:

```sh
.venv/bin/python pipeline/fetch_espn.py       # plain HTTP; caches raw answers in data/history_cache/espn
.venv/bin/python pipeline/fetch_history.py    # Sofascore, needs agent-browser; caches in data/history_cache
```

Sofascore shows a Cloudflare captcha if it gets requests too fast, so `fetch_history.py` fetches one URL at a time with a pause, resumes from the cache when rerun, and stops with a message when the captcha shows up (wait 15–30 minutes, then rerun). Delete a cached file to refetch it.

### Master database and data pack

The game does not read `data/` or `assets/` directly. The pipeline loads those files into a SQLite master database, one snapshot per run, and builds the **data pack** the app ships from the latest snapshot:

```sh
python3 pipeline/import_csv.py data pipeline/boleiro.db                          # a new snapshot in the master DB (git-ignored)
python3 pipeline/build_pack.py pipeline/boleiro.db packages/data/pack             # brazil.pack.json.gz
.venv/bin/python pipeline/build_assets.py pipeline/boleiro.db packages/data/pack  # assets/ and assets.json, needs Pillow
```

- `pipeline/schema.sql` is the database: countries, competitions, clubs, stadiums, players with ranked positions, values and contracts, finances, prize money, images, the source of each value, and every source's ids for a club or player. Every row carries its `snapshot_id`, and clubs and players keep the same id across snapshots, so two runs compare with a join. Back it up as a GitHub Release asset, not in git.
- `packages/data/pack/brazil.pack.json.gz` is one JSON document with a column per field (`clubs.name[i]` is club i's name), gzipped. `packVersion` is a hash of its content. A new game stores it in the save (`GameState.packVersion`), so a career keeps the pack it started with; a save from before packs reads as `FIRST_PACK_VERSION`, the pack built from the 2026 Brazil CSVs, which keeps its value when newer packs ship. `packages/data/src/dataPack.ts` decodes it: `loadPack()` in Node, `parsePack` on the text Vite bundles through `gunzipImports` (`?gunzip` imports).
- `packages/data/pack/assets/` holds every image, deduplicated by the content hash in its name, as WebP and AVIF fitted into 64, 128 and 256 px boxes (never upscaled). `assets.json` lists them and which club uses which. The app ships only the WebP crests and picks the box that fills each crest's size, and twice that for sharp screens.
- `pnpm test` builds a pack from `data/` in a temp folder and checks it decodes to exactly what the CSV parsers give, that the committed pack is that same pack, and that each asset class stays within its byte budget (`packages/data/src/assetBudget.test.ts`): today's size plus about 25%. When the world data lands, raise a budget on purpose in the same commit.

## Development

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm dev         # the game in the browser at http://localhost:5173 (saves go to IndexedDB)
pnpm tauri dev   # the desktop app (needs Rust); saves go to <app data dir>/saves
pnpm e2e         # Playwright tests on the web build at port 4173 (first run: pnpm --filter @boleiro/desktop exec playwright install chromium)
                 # it reuses a server already on that port; set E2E_PORT when another checkout has one running
                 # the build runs with VITE_E2E=1, which exposes the engine on window so a test can skip days
pnpm calibrate   # refits the engine, prints real-vs-Boleiro tables per division and for cup ties
pnpm test:long   # plays ten seasons, saving and loading each one, and checks revenue, strength and transfers stay in their bands
pnpm finances:report [seasons] [seed]   # prints revenue bands per division from a long run
pnpm strength:report [seasons] [seed]   # prints player strength bands and mean age per division each season
pnpm career [--seasons N] [--seed S]    # career mode with an auto-coach: clubs, targets, results, firings per division
pnpm history [--seasons N] [--seed S] [--club ID]   # same career run, then a club's titles, finishes, records, idols and the coach's record
pnpm season [--seasons N] [--seed S] [--club ID] [--report]   # whole seasons with no coach, then the realism report
```

The repo is a pnpm workspace. Packages hold TypeScript source with no build step: each `package.json` maps `@boleiro/<name>/<path>` to `src/<path>.ts`.

| Folder | Package | What it holds |
|---|---|---|
| `packages/data/` | `@boleiro/data` | The data pack and asset manifest the game ships (`pack/`) and their loaders, plus parsers for the files in `data/` (clubs, players, finances, history) |
| `packages/engine/` | `@boleiro/engine` | The sim: match engine (`src/engine/`), seasons and the club world (`src/sim/`), the CLI runs (`src/cli/`) |
| `packages/game-client/` | `@boleiro/game-client` | The engine session and its Web Worker, saves, and the selectors screens read from game state; no React |
| `packages/design-tokens/` | `@boleiro/design-tokens` | Colour and font tokens as CSS custom properties |
| `apps/desktop/` | `@boleiro/desktop` | The app: screens in `ui/` (Vite + React), the desktop window and save files in `src-tauri/`, Playwright tests in `e2e/` |
| `design/` | none | The Álbum design system: tokens and vendored fonts and icons (`tokens/`), the Boleiro logo (`logo/`), and an HTML mock of every screen with renders (`mocks/`, open `mocks/index.html`) |

Dependencies point one way: `data` ← `engine` ← `game-client` ← `desktop`. The sim stays UI-free: it runs in a Web Worker (`packages/game-client/src/engine/engine.worker.ts`) and the screens talk to it through `EngineClient` in `packages/game-client/src/engine/connectEngine.ts`. Every player action is a `GameCommand` (`packages/game-client/src/engine/createEngineSession.ts`), a plain JSON object such as `{ type: "ask", request }`; `engine.apply(command)` is the only call that changes the game, and the rest of `EngineClient` only reads it. The same commands applied from the same seed rebuild the same game, so online play can later send them over the network. ESLint stops `engine` and `data` from importing React, Tauri or the UI packages, stops `data` from importing any other Boleiro package, stops `game-client` from importing React, and stops everything outside the worker's session from importing `advanceDay`. In the browser the worker builds new games from the same data pack Node reads, bundled by Vite (`newGameFromFiles` in `packages/engine/src/sim/loadNewGame.ts`). The raw files stay at the repo root in `data/` and `assets/` as the pipeline's inputs.

`pnpm season` prints, for each season, the final tables (Série A and B with points, the top of C and D), the Copa do Brasil and estadual winners, promotions and relegations, the five biggest transfer fees, revenue bands per division and the clubs with the most and least cash. Then it prints one club's history (`--club`, by default the last Série A champion) and a realism report: markdown tables that compare results, Copa do Brasil upsets by division gap, cards, revenue, foreign players and injuries with the real data the sim is built on. `--report` prints only the realism report. The default test suite plays two seasons of it, saving and loading the game at each season start.
