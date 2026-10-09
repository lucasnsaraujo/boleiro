<img src="assets/logo.svg" width="96" alt="Boleiro logo">

# Boleiro

A Brazilian football manager game in the spirit of Brasfoot: simple to pick up, with real players, realistic money and match odds that behave like real football. You play as the coach.

## Data

`data/clubs.csv` lists every club of Série A–D 2026 plus every club that only plays its 2026 state championship: stadium, capacity, pitch, colours, crest and fanbase. `data/players.csv` holds every squad with a computed 1–99 strength, linked to its club by `club_id`. `data/SOURCES.md` names the source of every derived value. To rebuild both:

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/scrape_tm.py data/transfermarkt-players.csv   # squads and market values (Transfermarkt), cached in data/tm_cache
pipeline/fetch_sofascore.sh data/sofascore-stats.json                     # season stats (Sofascore), needs agent-browser
.venv/bin/python pipeline/fetch_wiki_colours.py data/transfermarkt-players.csv data/wiki-colours.csv   # kit colours (Wikidata + pt.wikipedia)
.venv/bin/python pipeline/build_clubs.py data/club-facts.csv data/wiki-colours.csv data/clubs.csv
.venv/bin/python pipeline/rate_players.py data/transfermarkt-players.csv data/sofascore-stats.json data/clubs.csv data/players.csv
```

`data/club-facts.csv` holds hand-checked values (artificial pitches, fanbase survey shares, short names, Sofascore ids) that override or fill the scraped ones.

Strength starts from a division baseline and moves with each player's own evidence: market value, share of minutes, Sofascore rating and, for forwards, goals and assists per 90. Players with little data stay near the baseline.

`data/history/brasileirao-serie-a-odds.csv` has Série A results since 2012 with closing betting odds, from football-data.co.uk. The match engine is calibrated against it, against the Série B–D results below, and against Copa do Brasil matches between divisions.

The rest of `data/history/` holds Copa do Brasil and Série B–D results from two sources, one folder each with the same columns:

- `sofascore/`: 2024 only, the season fetched before Sofascore's Cloudflare captcha blocked us. It is the only source with Série D, and its cup rows have closing 1X2 odds (119 of 122). Série B–D rows have no odds: Sofascore serves them one request per match and rate-limits hard, and calibrating home advantage and goals per game only needs results.
- `espn/`: every other season from ESPN's public API, 2015–2026 for the cup and Série B, 2017–2025 for Série C (ESPN has nothing earlier). No odds and no Série D.
- `divisions.csv` in each folder: the division every team played each season, from that season's standings, so a cup tie can be labelled "A vs D". ESPN only knows A–C, so in ESPN seasons a cup team without a division is Série D or below.

Each file has one row per finished match: date, round, source team ids and names, a normalized `*_key` for joining across sources, the score without any shootout, the shootout winner (`home`/`away`) and the odds columns. Série A odds come from football-data.co.uk (above). 2026 only has the matches finished when fetched.

`src/data/history.ts` loads them (`loadResults`, `loadDivisions`); a season both sources cover comes from Sofascore. To rebuild:

```sh
.venv/bin/python pipeline/fetch_espn.py       # plain HTTP; caches raw answers in data/history_cache/espn
.venv/bin/python pipeline/fetch_history.py    # Sofascore, needs agent-browser; caches in data/history_cache
```

Sofascore shows a Cloudflare captcha if it gets requests too fast, so `fetch_history.py` fetches one URL at a time with a pause, resumes from the cache when rerun, and stops with a message when the captcha shows up (wait 15–30 minutes, then rerun). Delete a cached file to refetch it.

## Development

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm calibrate   # refits the engine, prints real-vs-Boleiro tables per division and for cup ties
pnpm test:long   # plays ten seasons and checks club revenue and player strength stay in their division's band
pnpm finances:report [seasons] [seed]   # prints revenue bands per division from a long run
pnpm strength:report [seasons] [seed]   # prints player strength bands and mean age per division each season
```
