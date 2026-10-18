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
.venv/bin/python pipeline/fetch_sponsors.py      # kit makers and shirt sponsors (Wikipedia, before the betting ban) into data/sponsors.csv
.venv/bin/python pipeline/fetch_brand_logos.py   # data/brands.csv and the logos in assets/logos/ (Wikidata, Commons, favicons)
```

Sponsors: `data/sponsors.csv` holds every brand on each club's 2026 kit as Wikipedia listed it before Brazil's betting ban (25 September 2026), `data/sponsor-values.csv` the yearly values and ends the press reported, `data/brand-pool.csv` the brands that bid for a place in the game, and `data/brands.csv` every brand with its logo. `data/SOURCES.md`, "Sponsors", says where each comes from and how the game fills what the sources lack.

Positions and last elevens come from FotMob: `.venv/bin/python pipeline/scrape_fotmob.py data` (cached in `data/fotmob_cache`, the same polite fetcher as the Transfermarkt scraper) writes `data/fotmob-players.csv` (each player's FotMob positions, matched to his Transfermarkt id by name within the club) and `data/fotmob-lineups.csv` (each club's last starting eleven, with its formation where FotMob gives one; Séries C and D matches list the starters only). A player's main position stays Transfermarkt's; FotMob adds his others. In the game a player keeps his whole strength in his main position, 97% in another of his and 85% anywhere else (50% for a keeper outfield or an outfielder in goal); each club plays its last real formation, or the one its real eleven, or else its squad, fits best.

Every club's head coach comes from Transfermarkt's league manager lists: `python3 pipeline/fetch_coaches.py` (cached in `data/tm_cache`, `--offline` to rebuild from it) writes `data/coaches.csv` and the engine's roster `packages/data/src/coachRoster.ts`; clubs it doesn't cover get invented local coaches.

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

The game does not read `data/` or `assets/` directly. The pipeline loads those files into a SQLite master database, one snapshot per run, and builds the **data pack** the app ships from the latest CSV-import snapshot:

```sh
python3 pipeline/import_csv.py data pipeline/boleiro.db                          # a new snapshot in the master DB (git-ignored)
python3 pipeline/build_pack.py pipeline/boleiro.db packages/data/pack             # brazil.pack.json.gz and sponsors.pack.json.gz
.venv/bin/python pipeline/build_assets.py pipeline/boleiro.db packages/data/pack  # assets/ and assets.json, needs Pillow (and data/tm_cache for world/)
```

- `pipeline/schema.sql` is the database: countries, competitions, clubs, stadiums, players with ranked positions (Transfermarkt's main one at rank 0, FotMob's after it), clubs' last elevens (`club_lineups`), values and contracts, finances with the document and page behind each figure (`finance_sources`, from `data/finance-sources.csv`), prize money, brands and kit deals (`brands`, `sponsor_deals`), images, the source of each value, and every source's ids for a club or player. Every row carries its `snapshot_id`, and clubs and players keep the same id across snapshots, so two runs compare with a join. Back it up as a GitHub Release asset, not in git. The schema has no migrations yet: `CREATE TABLE IF NOT EXISTS` leaves an existing database's tables as they were, so after changing `schema.sql`, delete `pipeline/boleiro.db` and import again.
- `packages/data/pack/brazil.pack.json.gz` is one JSON document with a column per field (`clubs.name[i]` is club i's name), gzipped. `packVersion` is a hash of its content. A new game stores it in the save (`GameState.packVersion`), so a career keeps the pack it started with; a save from before packs reads as `FIRST_PACK_VERSION`, the pack built from the 2026 Brazil CSVs, which keeps its value when newer packs ship. Its `players.positions` column holds each player's roles, main first, and `lineups` each club's last eleven; a save from before positions gets both from the shipped pack when it loads (`withPackPositions`). `packages/data/src/dataPack.ts` decodes it: `loadPack()` in Node, `parsePack` on the text Vite bundles through `gunzipImports` (`?gunzip` imports).
- `packages/data/pack/assets/` holds every image in a folder per kind (`crest/`, `scoreboard_crest/`), deduplicated within the kind by the content hash in its name, as WebP and AVIF fitted into 64, 128 and 256 px boxes (never upscaled). `assets.json` lists them and which club uses which. The app ships only the WebP crests and picks the box that fills each crest's size, and twice that for sharp screens. `pack/world/assets/` and `pack/world/assets.json`, laid out the same, hold the crests of the latest world scrape's clubs that the CSV import doesn't have, in WebP only and in the 64 and 128 px boxes only (those clubs show in results, tables and brackets, never large; a screen asking for 256 gets the 128 file), so the v1 world's images stay within SPEC's ~25 MB (17.3 MB in all today with the sponsors' logos and the national teams' crests, held by `assetBudget.test.ts`). `pack/national/` holds the national teams' crests the same way, in a lossless 128-colour palette where it keeps a crest's look (`pipeline/fetch_national_crests.py`).
- `packages/data/pack/sponsors.pack.json.gz` holds the brands and the kit deals in a pack of their own (`packages/data/src/sponsors.ts`), so Brazil's pack and its `packVersion` don't move when a sponsor does. A new game copies each club's deals and the offer pool into the save; a save from before sponsors gets them seeded from the shipped pack when it loads. Their logos are in `pack/sponsors/assets/` and `pack/sponsors/assets.json` (brand to logo), WebP only, in the 64, 128 and 256 px boxes (a box a logo is too small to fill is left out), most in a 64-colour palette stored losslessly; a logo on an opaque tile (a site icon) is a `badge`, which the shirt shows as a sewn patch instead of printing it in the kit's ink. Every logo whose licence asks for credit (anything but public domain, CC0, copyrighted free use or a favicon's unknown licence) is listed in `packages/data/src/logoCredits.ts`, which `fetch_brand_logos.py` writes (`--credits` alone rewrites it from `data/brands.csv`) and Opções shows next to the sounds' credits.
- `pnpm test` builds a pack from `data/` in a temp folder and checks it decodes to exactly what the CSV parsers give, that the committed pack is that same pack, and that each asset class stays within its byte budget (`packages/data/src/assetBudget.test.ts`): today's size plus about 25%. When the world data lands, raise a budget on purpose in the same commit.

### World squads (Transfermarkt)

`pipeline/tm_world.py` lists the v1 world (SPEC §6): Brazil's Séries A–D, the top division of the other nine CONMEBOL countries (and Argentina's second), first and second divisions plus the national cup of every European country in the 2026/27 Champions or Europa League draw, Saudi Arabia, MLS and Mexico, the other Club World Cup clubs, and the national teams of the 2026 World Cup and the South American and European qualifiers. `scrape_world.py` writes it all into one `transfermarkt` snapshot of the master database (a run with `--countries`, `--no-guests` or `--no-national-teams` writes a `transfermarkt-partial` one, which the packs, the asset build and the roster diff skip when they look for the latest world): squads with Transfermarkt's position mapped to a role (goleiro, lateral, zagueiro, meia, atacante, in `pipeline/positions.py`), colours from each club's facts page, crests with their source URL, and the source of every club value (`guess` or `missing` where Transfermarkt has none). Players get no strength yet.

```sh
.venv/bin/python pipeline/scrape_world.py pipeline/boleiro.db [--countries br,gb-eng] [--delay 3]   # pages cached in data/tm_cache
.venv/bin/python pipeline/build_world_packs.py pipeline/boleiro.db packages/data/pack/world   # <country>.pack.json.gz + national-teams.pack.json.gz
python3 pipeline/roster_diff.py pipeline/boleiro.db                               # who moved where between the two latest full scrapes, as Markdown
.venv/bin/python -m unittest discover -s pipeline/tests -t pipeline              # the pipeline's tests, on saved pages in pipeline/tests/fixtures
```

The scraper names itself, but no person or account, in its User-Agent, waits `--delay` seconds after each page (never under the 2 Transfermarkt's robots.txt asks for), retries 429s and server errors with a growing back-off or the Retry-After the site sends, stops the run after 10 refusals (403 or 429) in a row, and keeps every page in the cache, so a stopped run resumes where it stopped and a rerun within `--max-age-days` downloads nothing. Each club costs a squad page, a facts page and a crest image. `--offline` rebuilds the snapshot from the cache alone and fails a page it doesn't have instead of downloading it. Brazil's clubs keep their ids from `data/clubs.csv`; other clubs are `tm-<Transfermarkt id>`, players `tm-<Transfermarkt id>`.

A new game in the app loads the nine other CONMEBOL countries' packs (`packages/game-client/src/engine/bundledGameFiles.ts`, read by `packages/data/src/worldPack.ts`): their leagues play result-only (`packages/engine/src/sim/world/southAmerica.ts`) and their clubs meet Brazil's in the Libertadores, Sul-Americana and Recopa (`packages/engine/src/sim/continental/`). Players get their strength from their Transfermarkt value by the line Brazil's own ratings draw against the same players' values (`strengthYardstick.ts`). It also loads the 25 European countries' packs: first and second divisions and a national cup each, played result-only from August to May (`packages/engine/src/sim/world/europe.ts`, Norway on the calendar year), and the Champions League, Europa League and UEFA Super Cup (`packages/engine/src/sim/continental/uefaCups.ts`), which open on the real 2026/27 league phases and from 2027/28 take each country's places from its table and cup by the 2026/27 allocation. Europe's clubs stay result-only: a coach can't take a European job yet. Node runs (`loadNewGame`, the CLI and engine tests) stay Brazil alone unless they pass `world: [...loadSouthAmerica(2026), ...loadEurope(2026)]`. It also loads the Saudi, US and Mexican packs, whose top flights a coach can take (MLS and Liga MX in their real formats, `packages/engine/src/sim/leagueFormats.ts`), and the Club World Cup guests', for FIFA's Club World Cup, which the game plays in 2029 and every four years after (`packages/engine/src/sim/continental/clubWorldCup.ts`) and calls Super Mundial, and for FIFA's yearly Intercontinental Cup, the six confederations' champions in September, October and December (`packages/engine/src/sim/continental/intercontinentalCup.ts`), which it calls Mundial de Clubes. `packages/data/src/worldPacks.test.ts` checks the committed ones: every country in `tm_world.py` has a pack and each league holds the club count `tm_world.py` records for it (the count Transfermarkt's league page lists; `verified=False` marks the ones no second source confirms yet); every club has at least eleven players with a goalkeeper (except the few Transfermarkt lists short, named in the test), a crest in `assets.json` or `world/assets.json` and every world crest's files within budget, two colours and a source for every field; every country's league tiers run from the first down; every national team has a squad with a goalkeeper.

## Development

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm dev         # the game in the browser at http://localhost:5173 (saves go to IndexedDB)
pnpm tauri dev   # the desktop app (needs Rust); saves go to <app data dir>/saves
pnpm tauri build # the macOS .app and .dmg (Windows: .exe and .msi); docs/release.md covers CI builds, signing and the Windows smoke test
pnpm e2e         # Playwright tests on the web build at port 4173 (first run: pnpm --filter @boleiro/desktop exec playwright install chromium)
                 # it reuses a server already on that port; set E2E_PORT when another checkout has one running
                 # the build runs with VITE_E2E=1, which exposes the engine on window so a test can skip days
                 # and starts every new game from the world seed playwright.config.ts sets
pnpm calibrate   # refits the engine, prints real-vs-Boleiro tables per division and for cup ties
pnpm test:long   # plays ten seasons, saving and loading each one, and checks revenue, strength and transfers stay in their bands
pnpm finances:report [seasons] [seed]   # prints revenue bands per division from a long run
pnpm strength:report [seasons] [seed]   # prints player strength bands and mean age per division each season
pnpm career [--seasons N] [--seed S]    # career mode with an auto-coach: clubs, targets, results, firings per division
pnpm history [--seasons N] [--seed S] [--club ID]   # same career run, then a club's titles, finishes, records, idols and the coach's record
pnpm season [--seasons N] [--seed S] [--club ID] [--report]   # whole seasons with no coach, then the realism report
pnpm world:rates [--leagues N] [--seed S]   # synthetic leagues played in full and result-only; fails if goals per match differ by 0.1 or a home, draw or away rate by 2 points, the engine's calibration tolerance
```

The repo is a pnpm workspace. Packages hold TypeScript source with no build step: each `package.json` maps `@boleiro/<name>/<path>` to `src/<path>.ts`.

| Folder | Package | What it holds |
|---|---|---|
| `packages/data/` | `@boleiro/data` | The data pack and asset manifest the game ships (`pack/`) and their loaders, plus parsers for the files in `data/` (clubs, players, finances, history) |
| `packages/engine/` | `@boleiro/engine` | The sim: match engine (`src/engine/`), seasons and the club world (`src/sim/`), the CLI runs (`src/cli/`) |
| `packages/game-client/` | `@boleiro/game-client` | The engine session and its Web Worker, saves, and the selectors screens read from game state; no React |
| `packages/design-tokens/` | `@boleiro/design-tokens` | The Álbum design system that the app and the mocks share: light and dark tokens (`album.css`, `tokens.json`), the vendored Archivo font and Phosphor icons (subset to the ones the screens use by `pipeline/subset_icons.py`), and `tokens.css`, the older token names pointed at the Álbum ones |
| `apps/desktop/` | `@boleiro/desktop` | The app: screens in `ui/` (Vite + React), the desktop window and save files in `src-tauri/`, Playwright tests in `e2e/` |
| `design/` | none | The Boleiro logo (`logo/`), and an HTML mock of every screen with renders (`mocks/`, open `mocks/index.html`) |

Dependencies point one way: `data` ← `engine` ← `game-client` ← `desktop`. The sim stays UI-free: it runs in a Web Worker (`packages/game-client/src/engine/engine.worker.ts`) and the screens talk to it through `EngineClient` in `packages/game-client/src/engine/connectEngine.ts`. Every player action is a `GameCommand` (`packages/game-client/src/engine/createEngineSession.ts`), a plain JSON object such as `{ type: "ask", request }`; `engine.apply(command)` is the only call that changes the game, and the rest of `EngineClient` only reads it. The same commands applied from the same seed rebuild the same game, so online play can later send them over the network. ESLint stops `engine` and `data` from importing React, Tauri or the UI packages, stops `data` from importing any other Boleiro package, stops `game-client` from importing React, and stops everything outside the worker's session from importing `advanceDay`. In the browser the worker builds new games from the same data pack Node reads, bundled by Vite (`newGameFromFiles` in `packages/engine/src/sim/loadNewGame.ts`). The raw files stay at the repo root in `data/` and `assets/` as the pipeline's inputs.

`pnpm season` prints, for each season, the final tables (Série A and B with points, the top of C and D), the Copa do Brasil and estadual winners, promotions and relegations, the five biggest transfer fees, revenue bands per division and the clubs with the most and least cash. Then it prints one club's history (`--club`, by default the last Série A champion) and a realism report: markdown tables that compare results, Copa do Brasil upsets by division gap, cards, revenue, foreign players and injuries with the real data the sim is built on. `--report` prints only the realism report. The default test suite plays two seasons of it, saving and loading the game at each season start.
