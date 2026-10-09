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

`data/history/brasileirao-serie-a-odds.csv` has Série A results since 2012 with closing betting odds, from football-data.co.uk. The match engine is calibrated against it.

The rest of `data/history/` comes from Sofascore, 2015–2026:

- `copa-do-brasil.csv`, `brasileirao-serie-b.csv`, `brasileirao-serie-c.csv`, `brasileirao-serie-d.csv`: one row per finished match with date, round, Sofascore team ids and names, the score without any shootout, the shootout winner (`home`/`away`) when there was one, and closing 1X2 odds in decimal. Only the cup has odds: Sofascore serves them one request per match and rate-limits hard, and calibrating home advantage and goals per game in Série B–D only needs results (Série A odds come from football-data.co.uk). The odds columns of the B–D files are empty.
- `divisions.csv`: which division (A–D) every team played each season, taken from that season's standings, so a cup tie can be labelled "A vs D".

`src/data/history.ts` loads them (`loadResults`, `loadDivisions`). To rebuild:

```sh
.venv/bin/python pipeline/fetch_history.py   # needs agent-browser; caches raw answers in data/history_cache
```

Sofascore shows a Cloudflare captcha if it gets requests too fast, so the script fetches one URL at a time with a pause. The cup odds alone are about 1,400 calls, so a full run takes a while; it resumes from the cache when rerun, and it stops with a message if the captcha shows up (wait 15–30 minutes, then rerun). Delete a file in `data/history_cache/` to refetch it, for example the current season's.

## Development

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm calibrate   # compares simulated seasons with real Série A rates
```
