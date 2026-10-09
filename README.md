<img src="assets/logo.svg" width="96" alt="Boleiro logo">

# Boleiro

A Brazilian football manager game in the spirit of Brasfoot: simple to pick up, with real players, realistic money and match odds that behave like real football. You play as the coach.

## Data

`data/players.csv` holds every Série A–D squad with a computed 1–99 strength. To rebuild it:

```sh
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/scrape_tm.py data/transfermarkt-players.csv   # squads and market values (Transfermarkt), cached in data/tm_cache
pipeline/fetch_sofascore.sh data/sofascore-stats.json                     # season stats (Sofascore), needs agent-browser
.venv/bin/python pipeline/rate_players.py data/transfermarkt-players.csv data/sofascore-stats.json data/players.csv
```

Strength starts from a division baseline and moves with each player's own evidence: market value, share of minutes, Sofascore rating and, for forwards, goals and assists per 90. Players with little data stay near the baseline.

`data/history/brasileirao-serie-a-odds.csv` has Série A results since 2012 with closing betting odds, from football-data.co.uk. The match engine is calibrated against it.

## Development

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm calibrate   # compares simulated seasons with real Série A rates
```
