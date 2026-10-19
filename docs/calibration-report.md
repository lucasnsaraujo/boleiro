# Calibration report

Does the game still score goals, win, draw, lose and book players like the real leagues it was calibrated on, now that national football, referees with VAR, tactics, injuries and the world abroad play along?

The short answer: **every league abroad with a real reference now plays like itself, and Brazil's cards and Série A, B and D results match; Série C still scores too many goals after the first season.** The cause of that drift is found and measured below; its fix changes how squads develop, so it waits on its own branch for a decision on one ten-season test.

## Findings

1. **Série A passes** on home, draw, away and goals (2.45 goals a game against a real 2.49). **Série B passes**, by a little: draws are 26.6% against 28.7% (band 2.2). **Série D passes** (2.42 against 2.24, inside its wide band, because the real sample is one season of 510 games).
2. **Série C scores too much after the first season**: 2.39 goals a game against 2.22, and 26.5% draws against 30.1%. It is right on day one (2.26 in `pnpm calibrate`) and in season 1 of a run (2.28), then climbs to 2.45 by season 4; Série D does the same (2.29, then 2.44 to 2.50). Brazil alone, without the world abroad, drifts alike, so the cause is at home. Finding 3 names it.
3. **Why the lower divisions drift: promotion and relegation.** Every season each player drifts 15% of the way toward his division's level (`CLUB_LEVEL`, 72, 63, 56 and 49 for Série A to D), and a club that changes division keeps its squad. So a promoted club arrives 5 to 8 points below its new division and a relegated one as far above it: one seed's first rollover takes the spread of club ratings inside Série C from 1.4 to 4.1 points (the clubs that stayed: 1.0). Wider gaps mean more lopsided games, so more goals and fewer draws. Real moved clubs are nothing like that. In their first season after the move, 2016–2026, clubs promoted to Série A, B and C took 1.14, 1.31 and 1.33 points a game and clubs relegated to Série B and C 1.53 and 1.38, against 1.43, 1.31 and 1.34 for the clubs that stayed (ESPN's and Sofascore's results with `divisions.csv`, Série A's from the odds file). In the game they take 0.74, 0.84, 0.95, 1.93 and 1.95 (six seeds, seasons 2–4). The fix is on branch `fix/calibration-drift`: players drift toward the level their club's revenue buys inside its division (the 2026 squads rise 1.8 points per e-fold of revenue), a moved club rebuilds most of the way to its new level, and squads keep the 2026 squads' share of forwards. With it, Série C plays 2.29, 2.26, 2.36 and 2.32 goals a game in seasons 1 to 4 and every Brazilian division passes. It is not merged here because the ten-season run's spread check (`expectSpreadSettles`) takes the season after the first rollover as settled, and that season was settled only because promotions blew the spread up at once; without the jump the spread takes about four seasons to reach the same level.
4. **Cards pass** for the three competitions with a real sample: Série A 5.02 yellows and 0.295 reds a game against 5.04 and 0.296, Série B 5.09 and 0.311 against 5.16 and 0.316, and the Copa do Brasil row (which also holds the continental cups, see below) 4.45 and 0.261 against 4.70 and 0.277. Série C, Série D and the estaduais have no real card data; they borrow Série B's or the cup's rates, so their match with the borrowed rate proves only that the engine applies it.
5. **The Copa do Brasil's upsets pass in 8 of 9 judged groups.** The known gap stays: a Série A club playing away at a Série B club wins 31% in the game against 53% real. The comment in `cupCalibration.test.ts` explains it: one symmetric home advantage cannot fit a Série A club at home to Série B (69% real, 62% in the game, 68% in `pnpm calibrate`) and away (53% real).
6. **Leagues abroad pass in 23 of the 23 that have a real reference**, against 2 before. Each league now plays at its own params, fitted by `pnpm calibrate` to football-data.co.uk's results the same way Série B–D are fitted to theirs (baseGoals, homeAdvantage and lowScoreCorrelation, on the clubs' result-only elevens at the game's start), and the result-only tier and the full tier read the same table (`paramsForLeagueAbroad`). The fit is exact on day one; over four seasons the Bundesliga plays 3.21 goals a game against 3.19, the Premier League 2.98 against 2.95, Argentina 2.13 against 2.11, and Austria's home side wins 39.5% against 39.8%.
7. **Cards abroad are each league's own** where football-data.co.uk lists them: 17 European leagues, from 3.00 yellows a game (Eredivisie) to 5.18 (Greece), split by side as the real games are. The full tier draws a human coach's club abroad at its league's rates (`LEAGUE_ABROAD_CARD_RATES`); Argentina, the USA, Mexico, Norway, Austria, Poland and the leagues without a reference still borrow Série A's.
8. **Leagues without a real reference** (39 of the 62) play at a labelled guess: a South American league at Brazil's division of its level, a European one or the Saudi Pro League at the median fitted European league of its level. Some still play oddly: Cyprus' second division has 18.8% draws and 3.11 goals a game, the Saudi Pro League 22.4% and 3.06. Most likely their squads have wide strength gaps from sparse Transfermarkt data. Check them before trusting them.

What to do, in order of value: decide on the spread check and merge `fix/calibration-drift`; fetch real results for the 39 leagues without a reference (none of them is on football-data.co.uk); fit each league's strengthImpact to closing odds, as Série A's is, where football-data.co.uk has them.

## How the numbers are made

- **Simulation.** `worldCalibrationRun` plays the v1 world (Brazil in the full tier, 62 leagues abroad result-only, 1,344 clubs) with no human coach, for four seasons from 2026, on ten seeds (1 to 10). Four seasons give three finished seasons of every league that runs across the new year: the first of them starts in August 2026.
- **Commit.** The tables carry the commit they were generated at. A change in the engine, the data or a seeded stream moves the seeds' games, so a later run can differ by a fraction of a point without the game having changed; the bands are wider than that.
- **Reproduce.** `pnpm calibration:report --seeds 10 --seasons 4 --write docs/calibration-report.md` replaces the tables below. It takes about two minutes. The seeds make the numbers repeat exactly. `pnpm calibrate` prints every fitted parameter set next to the one in use, the leagues abroad included.
- **Real data for Brazil.** The data the engine was calibrated on, read by `pnpm calibrate`: Série A results from 2022 on, with closing odds (`data/history/brasileirao-serie-a-odds.csv`, football-data.co.uk, 1,809 games); Série B, C and D results (Sofascore for 2024, ESPN for the other seasons: 1,840, 864 and 510 games); Copa do Brasil 2017–2025 between divisions; yellow and red cards of Série A, Série B and the Copa do Brasil 2024–2025 (ESPN match summaries: 760, 760 and 141 games). Rows and sources are in `data/SOURCES.md`.
- **Real data for the leagues abroad.** `data/history/football-data/league-rates.csv`, built by `pipeline/fetch_football_data_rates.py` from football-data.co.uk. The 17 European leagues are the finished seasons 2022/23 to 2025/26, with cards by side. Argentina, the USA, Mexico, Norway, Austria and Poland are the calendar years 2022–2025 (Mexico and Austria and Poland by season), goals only. The files list every finished game, so Argentina's, MLS' and Liga MX's counts include play-offs and cups that the result-only tier does not play. `pnpm calibrate` fits each league's match params to this file and the full tier draws each league's cards at its rates, so a league abroad passing its band shows the fit holds over seasons of promotions and relegations, not an independent check.
- **The band.** A number passes when the simulated value is within `max(floor, 2 × standard error)` of the real one. The standard error covers both samples (real and simulated). The floor is the tolerance of the engine's own calibration tests (`calibration.test.ts`): 2 points on a result share and 0.10 goals for Série A and B, 2.5 points for Série C, 4 points and 0.20 goals for Série D, and the Série B floor for leagues abroad. Cards use a floor of 0.30 yellows and 0.05 reds. Cup shares use 5 points. A verdict lists each failed metric with its gap and band.
- **Spread of goals.** The real variance of goals a game comes from the real data where the file holds it (the leagues abroad) and from the simulation otherwise.
- **Cards in the "Copa do Brasil and the continental cups" row.** `cardCompetitionOf` gives the Copa do Brasil, the continental cups and national football the same card rates, so the game reports them as one competition. The real row is the Copa do Brasil's.
- **Group sizes.** A cup group the simulation filled with fewer than 30 matches is shown but not judged.

## Results

<!-- tables:start -->

Generated by `pnpm calibration:report --seeds 10 --seasons 4`: 10 seeds (1 to 10) × 4 seasons of the v1 world, no human coach, starting in 2026, at commit d3372edc.

## Verdicts at a glance

| Check | Passed |
|---|---|
| Brazil league results (home, draw, away and goals per division) | 3 of 4 divisions |
| Brazil cards (Série A, B and the Copa do Brasil, the ones with a real sample) | 6 of 6 numbers |
| Copa do Brasil results by division gap and venue | 8 of 9 groups |
| Leagues abroad with real results | 23 of 23 leagues |

## Brazil's leagues

| Division | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed | Verdict |
|---|---|---|---|---|---|---|---|---|
| Série A | 15200 | 1809 | 45.4 / 47.2 | 27.7 / 26.9 | 26.9 / 25.9 | 2.45 / 2.49 | 2.41–2.54 | pass |
| Série B | 15200 | 1840 | 48.1 / 47.9 | 26.6 / 28.7 | 25.4 / 23.4 | 2.25 / 2.17 | 2.17–2.31 | pass |
| Série C | 11220 | 864 | 49.0 / 47.7 | 26.5 / 30.1 | 24.5 / 22.2 | 2.39 / 2.22 | 2.34–2.42 | fail: draw −3.6 (band 3.2); goals +0.17 (band 0.11) |
| Série D | 24400 | 510 | 46.4 / 45.5 | 27.3 / 30.2 | 26.4 / 24.3 | 2.42 / 2.24 | 2.37–2.48 | pass |

### Brazil's leagues by season

Goals per game, then home win % in brackets, over all seeds.

| Division | Real | Season 1 | Season 2 | Season 3 | Season 4 |
|---|---|---|---|---|---|
| Série A | 2.49 (47.2) | 2.48 (43.6) | 2.49 (45.9) | 2.41 (45.7) | 2.44 (46.4) |
| Série B | 2.17 (47.9) | 2.13 (47.4) | 2.36 (47.9) | 2.21 (49.0) | 2.28 (47.9) |
| Série C | 2.22 (47.7) | 2.28 (49.1) | 2.37 (48.2) | 2.44 (48.8) | 2.45 (49.8) |
| Série D | 2.24 (45.5) | 2.29 (44.9) | 2.44 (46.5) | 2.48 (47.2) | 2.50 (46.9) |

## Brazil's cards

| Competition | Games B | Yellows/game B | Yellows/game real | Reds/game B | Reds/game real | Verdict |
|---|---|---|---|---|---|---|
| Série A | 15200 | 5.02 | 5.04 | 0.295 | 0.296 | pass |
| Série B | 15200 | 5.09 | 5.16 | 0.311 | 0.316 | pass |
| Série C | 11220 | 5.14 | 5.16 | 0.316 | 0.316 | no real sample, rates borrowed from Série B |
| Série D | 24400 | 5.11 | 5.16 | 0.314 | 0.316 | no real sample, rates borrowed from Série B |
| Copa do Brasil and the continental cups | 19590 | 4.45 | 4.70 | 0.261 | 0.277 | pass |
| Estaduais | 30840 | 4.65 | 4.70 | 0.279 | 0.277 | no real sample, rates borrowed from the Copa do Brasil |

## Copa do Brasil upsets

| Gap | Favourite plays | Games B | Games real | Favourite wins % B / real | Draws % B / real | Loses % B / real | Verdict |
|---|---|---|---|---|---|---|---|
| AvB | home | 372 | 74 | 65 / 69 | 23 / 19 | 12 / 12 | pass |
| AvB | away | 371 | 75 | 31 / 53 | 33 / 27 | 36 / 20 | fail: win −22 (band 13); loss +16 (band 10) |
| AvC | home | 147 | 43 | 76 / 79 | 13 / 16 | 12 / 5 | pass |
| AvC | away | 147 | 49 | 44 / 39 | 32 / 29 | 24 / 33 | pass |
| AvD | home | 99 | 45 | 87 / 87 | 11 / 11 | 2 / 2 | pass |
| AvD | away | 99 | 125 | 58 / 61 | 28 / 30 | 14 / 10 | pass |
| BvC | home | 4 | 17 | - | - | - | too few simulated games, not judged |
| BvC | away | 180 | 24 | 35 / 21 | 32 / 42 | 33 / 38 | pass |
| BvD | home | 0 | 24 | - | - | - | too few simulated games, not judged |
| BvD | away | 1370 | 155 | 49 / 43 | 28 / 32 | 22 / 26 | pass |
| CvD | home | 0 | 13 | - | - | - | too few simulated games, not judged |
| CvD | away | 1060 | 91 | 38 / 42 | 30 / 23 | 32 / 35 | pass |

## Leagues abroad: results

| League | League seasons B / real | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed-run | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Liga Profesional (AR1) | 40 / 4 | 17400 | 2254 | 42.6 / 42.7 | 31.8 / 32.0 | 25.6 / 25.3 | 2.13 / 2.11 | 2.10–2.19 | pass |
| Bundesliga (AT1) | 30 / 4 | 3960 | 774 | 39.5 / 39.8 | 27.0 / 27.0 | 33.6 / 33.2 | 2.74 / 2.75 | 2.55–2.89 | pass |
| Jupiler Pro League (BE1) | 30 / 4 | 9180 | 1241 | 43.1 / 43.3 | 25.4 / 25.6 | 31.5 / 31.1 | 2.88 / 2.82 | 2.81–2.95 | pass |
| Bundesliga (DE1) | 30 / 4 | 9180 | 1224 | 44.0 / 43.4 | 24.8 / 25.2 | 31.2 / 31.5 | 3.21 / 3.19 | 3.14–3.28 | pass |
| 2. Bundesliga (DE2) | 30 / 4 | 9180 | 1224 | 43.6 / 44.7 | 24.5 / 24.8 | 31.9 / 30.5 | 3.00 / 3.00 | 2.88–3.14 | pass |
| LaLiga (ES1) | 30 / 4 | 11400 | 1520 | 46.9 / 46.3 | 24.5 / 25.4 | 28.6 / 28.3 | 2.62 / 2.62 | 2.58–2.69 | pass |
| LaLiga2 (ES2) | 30 / 4 | 13860 | 1848 | 45.0 / 45.5 | 29.0 / 29.1 | 25.9 / 25.4 | 2.36 / 2.36 | 2.28–2.41 | pass |
| Ligue 1 (FR1) | 30 / 4 | 9180 | 1298 | 42.4 / 43.7 | 24.7 / 23.9 | 33.0 / 32.4 | 2.83 / 2.83 | 2.72–3.00 | pass |
| Ligue 2 (FR2) | 30 / 4 | 9180 | 1370 | 42.4 / 42.6 | 27.7 / 27.5 | 29.9 / 29.9 | 2.48 / 2.49 | 2.41–2.53 | pass |
| Premier League (GB-ENG1) | 30 / 4 | 11400 | 1520 | 44.7 / 44.5 | 23.2 / 24.1 | 32.1 / 31.4 | 2.98 / 2.95 | 2.91–3.07 | pass |
| Championship (GB-ENG2) | 30 / 4 | 16560 | 2208 | 42.8 / 43.3 | 26.5 / 26.3 | 30.7 / 30.4 | 2.56 / 2.54 | 2.50–2.61 | pass |
| Scottish Premiership (GB-SCT1) | 30 / 4 | 3960 | 912 | 47.4 / 46.7 | 22.8 / 23.0 | 29.8 / 30.3 | 2.89 / 2.86 | 2.75–2.97 | pass |
| Scottish Championship (GB-SCT2) | 30 / 4 | 2700 | 720 | 40.9 / 40.7 | 28.1 / 28.3 | 31.0 / 31.0 | 2.69 / 2.63 | 2.52–2.77 | pass |
| Super League 1 (GR1) | 30 / 4 | 5460 | 949 | 40.5 / 41.6 | 27.2 / 26.7 | 32.4 / 31.7 | 2.63 / 2.58 | 2.43–2.72 | pass |
| Serie A (IT1) | 30 / 4 | 11400 | 1520 | 40.7 / 40.7 | 27.2 / 27.6 | 32.1 / 31.7 | 2.58 / 2.54 | 2.55–2.62 | pass |
| Serie B (IT2) | 30 / 4 | 11400 | 1520 | 41.2 / 40.6 | 31.6 / 32.3 | 27.3 / 27.1 | 2.51 / 2.47 | 2.45–2.55 | pass |
| Liga MX (MX1) | 40 / 4 | 12240 | 1358 | 45.4 / 46.0 | 25.7 / 25.8 | 28.9 / 28.2 | 2.84 / 2.82 | 2.74–2.90 | pass |
| Eredivisie (NL1) | 30 / 4 | 9180 | 1224 | 44.6 / 44.4 | 24.9 / 25.0 | 30.4 / 30.6 | 3.14 / 3.12 | 3.07–3.20 | pass |
| Eliteserien (NO1) | 40 / 4 | 9600 | 966 | 46.5 / 46.7 | 20.6 / 21.3 | 32.9 / 32.0 | 3.10 / 3.09 | 3.04–3.15 | pass |
| Ekstraklasa (PL1) | 30 / 4 | 9180 | 1224 | 44.0 / 43.9 | 26.8 / 27.5 | 29.2 / 28.7 | 2.71 / 2.66 | 2.64–2.76 | pass |
| Liga Portugal (PT1) | 30 / 4 | 9180 | 1224 | 44.6 / 44.2 | 23.0 / 23.9 | 32.4 / 31.9 | 2.66 / 2.65 | 2.60–2.74 | pass |
| Süper Lig (TR1) | 30 / 4 | 9180 | 1370 | 45.7 / 45.4 | 24.1 / 25.0 | 30.3 / 29.6 | 2.89 / 2.86 | 2.74–3.03 | pass |
| MLS (US1) | 40 / 4 | 17400 | 2072 | 45.9 / 46.6 | 26.4 / 26.0 | 27.7 / 27.5 | 2.96 / 2.96 | 2.87–3.03 | pass |

## Leagues abroad: cards

| League | Real games with cards | Yellows/game real | Yellows/game, full tier abroad | Reds/game real | Reds/game, full tier abroad |
|---|---|---|---|---|---|
| Premier League (GB-ENG1) | 1520 | 3.89 | 3.89 | 0.116 | 0.116 |
| Championship (GB-ENG2) | 2208 | 3.79 | 3.79 | 0.109 | 0.109 |
| LaLiga (ES1) | 1520 | 4.67 | 4.67 | 0.265 | 0.265 |
| LaLiga2 (ES2) | 1848 | 4.89 | 4.89 | 0.260 | 0.260 |
| Serie A (IT1) | 1520 | 4.09 | 4.09 | 0.183 | 0.183 |
| Serie B (IT2) | 1520 | 4.92 | 4.92 | 0.247 | 0.247 |
| Bundesliga (DE1) | 1223 | 3.99 | 3.99 | 0.168 | 0.168 |
| 2. Bundesliga (DE2) | 1224 | 4.51 | 4.51 | 0.198 | 0.198 |
| Ligue 1 (FR1) | 1298 | 3.67 | 3.67 | 0.240 | 0.240 |
| Ligue 2 (FR2) | 1369 | 3.71 | 3.71 | 0.226 | 0.226 |
| Liga Portugal (PT1) | 1224 | 5.13 | 5.13 | 0.285 | 0.285 |
| Eredivisie (NL1) | 1224 | 3.00 | 3.00 | 0.160 | 0.160 |
| Süper Lig (TR1) | 1339 | 4.55 | 4.55 | 0.222 | 0.222 |
| Jupiler Pro League (BE1) | 1238 | 3.87 | 3.87 | 0.219 | 0.219 |
| Scottish Premiership (GB-SCT1) | 912 | 3.75 | 3.75 | 0.194 | 0.194 |
| Scottish Championship (GB-SCT2) | 720 | 3.92 | 3.92 | 0.157 | 0.157 |
| Super League 1 (GR1) | 948 | 5.18 | 5.18 | 0.258 | 0.258 |

## Leagues abroad without a real reference

| League | League seasons | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|---|
| Premier League (AM1) | 30 | 3960 | 43.3 | 27.2 | 29.5 | 2.67 |
| First League (AM2) | 30 | 6300 | 41.8 | 29.7 | 28.5 | 2.42 |
| Primera Nacional (AR2) | 40 | 25200 | 47.8 | 28.6 | 23.6 | 2.17 |
| 2. Liga (AT2) | 30 | 7200 | 42.6 | 30.3 | 27.0 | 2.39 |
| Premyer Liqa (AZ1) | 30 | 3960 | 41.6 | 28.4 | 29.9 | 2.58 |
| Challenger Pro League (BE2) | 30 | 6300 | 42.3 | 28.8 | 28.9 | 2.43 |
| efbet Liga (BG1) | 30 | 5460 | 43.1 | 26.2 | 30.7 | 2.71 |
| Vtora Liga (BG2) | 30 | 9180 | 42.1 | 29.3 | 28.6 | 2.43 |
| División Profesional (BO1) | 40 | 9600 | 44.8 | 29.1 | 26.2 | 2.39 |
| Liga de Primera (CL1) | 40 | 9600 | 45.6 | 28.0 | 26.4 | 2.46 |
| Liga Dimayor (CO1) | 40 | 15200 | 46.8 | 27.1 | 26.1 | 2.49 |
| Cyprus League (CY1) | 30 | 5460 | 43.9 | 26.7 | 29.4 | 2.72 |
| 2. Division (CY2) | 30 | 7200 | 44.7 | 18.8 | 36.5 | 3.11 |
| Chance Liga (CZ1) | 30 | 7200 | 44.0 | 24.8 | 31.2 | 2.76 |
| Chance Národní Liga (CZ2) | 30 | 7200 | 41.9 | 30.0 | 28.1 | 2.38 |
| LigaPro Serie A (EC1) | 40 | 9600 | 46.4 | 27.1 | 26.5 | 2.44 |
| Super League 2 (GR2) | 30 | 7200 | 41.9 | 29.9 | 28.3 | 2.40 |
| SuperSport HNL (HR1) | 30 | 2700 | 43.3 | 24.6 | 32.1 | 2.88 |
| Prva Nogometna Liga (HR2) | 30 | 7200 | 41.3 | 29.5 | 29.2 | 2.53 |
| Nemzeti Bajnokság (HU1) | 30 | 3960 | 43.5 | 26.6 | 29.9 | 2.74 |
| Nemzeti Bajnokság II (HU2) | 30 | 7200 | 41.9 | 29.9 | 28.2 | 2.39 |
| Ligat ha'Al (IL1) | 30 | 5460 | 44.3 | 25.6 | 30.1 | 2.82 |
| Liga Leumit (IL2) | 30 | 7200 | 42.3 | 29.0 | 28.8 | 2.51 |
| Keuken Kampioen Divisie (NL2) | 30 | 11400 | 42.3 | 29.2 | 28.5 | 2.45 |
| OBOS-ligaen (NO2) | 40 | 9600 | 41.5 | 29.4 | 29.1 | 2.48 |
| Liga 1 (PE1) | 40 | 12240 | 45.9 | 28.1 | 26.0 | 2.39 |
| I liga (PL2) | 30 | 9180 | 41.9 | 28.8 | 29.3 | 2.43 |
| Liga Portugal 2 (PT2) | 30 | 9180 | 41.8 | 29.0 | 29.3 | 2.39 |
| Primera División (PY1) | 40 | 5280 | 46.3 | 25.7 | 28.0 | 2.55 |
| Saudi Pro League (SA1) | 30 | 9180 | 45.1 | 22.4 | 32.5 | 3.06 |
| Prva Liga (SI1) | 30 | 2700 | 42.1 | 26.1 | 31.8 | 2.67 |
| Druga Liga (SI2) | 30 | 7200 | 42.7 | 29.6 | 27.7 | 2.41 |
| Niké Liga (SK1) | 30 | 3960 | 43.9 | 26.8 | 29.4 | 2.67 |
| MONACObet Liga (SK2) | 30 | 7200 | 41.8 | 28.7 | 29.5 | 2.42 |
| 1. Lig (TR2) | 30 | 11400 | 43.2 | 28.1 | 28.6 | 2.52 |
| Premier Liga (UA1) | 30 | 7200 | 43.6 | 23.9 | 32.5 | 2.79 |
| Persha Liga (UA2) | 30 | 7200 | 41.8 | 28.7 | 29.5 | 2.43 |
| Liga AUF (UY1) | 40 | 9600 | 47.2 | 26.8 | 26.1 | 2.51 |
| Liga FUTVE (VE1) | 40 | 8400 | 47.3 | 22.6 | 30.1 | 2.87 |

## Other competitions the game plays with a full match engine

| Competition | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|
| club-world-cup | 630 | 39.7 | 26.5 | 33.8 | 1.86 |
| cup | 6200 | 40.1 | 28.5 | 31.4 | 2.27 |
| intercontinental-cup | 200 | 49.0 | 19.0 | 32.0 | 2.38 |
| libertadores | 6200 | 49.5 | 28.2 | 22.2 | 2.30 |
| recopa | 80 | 46.3 | 23.8 | 30.0 | 2.39 |
| state | 30840 | 50.3 | 25.8 | 23.9 | 2.41 |
| sul-americana | 6280 | 50.7 | 28.0 | 21.3 | 2.29 |

## National cups abroad, result-only

| Cup of | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|
| AM | 780 | 54.7 | 11.7 | 33.6 | 2.85 |
| AT | 810 | 54.3 | 11.9 | 33.8 | 2.87 |
| AZ | 330 | 54.5 | 15.5 | 30.0 | 2.62 |
| BE | 960 | 55.5 | 12.7 | 31.8 | 2.91 |
| BG | 930 | 54.4 | 11.8 | 33.8 | 2.84 |
| CY | 870 | 55.3 | 12.0 | 32.8 | 3.03 |
| CZ | 930 | 53.2 | 13.5 | 33.2 | 2.77 |
| DE | 1050 | 52.8 | 11.3 | 35.9 | 2.89 |
| ES | 1230 | 54.5 | 11.6 | 33.9 | 2.99 |
| FR | 1050 | 47.0 | 22.5 | 30.5 | 2.77 |
| GB-ENG | 1290 | 54.3 | 12.9 | 32.9 | 2.79 |
| GB-SCT | 630 | 54.8 | 11.9 | 33.3 | 2.90 |
| GR | 870 | 46.4 | 22.8 | 30.8 | 2.64 |
| HR | 750 | 53.5 | 12.3 | 34.3 | 2.88 |
| HU | 810 | 54.7 | 13.3 | 32.0 | 2.89 |
| IL | 870 | 51.3 | 13.7 | 35.1 | 2.81 |
| IT | 1170 | 49.0 | 23.2 | 27.8 | 2.65 |
| NL | 1110 | 51.5 | 10.5 | 38.0 | 2.94 |
| NO | 1240 | 54.1 | 12.1 | 33.8 | 2.83 |
| PL | 1050 | 54.3 | 12.6 | 33.1 | 2.83 |
| PT | 1050 | 49.9 | 13.6 | 36.5 | 2.87 |
| SI | 750 | 55.6 | 14.1 | 30.3 | 2.69 |
| SK | 810 | 46.7 | 25.3 | 28.0 | 2.59 |
| TR | 1110 | 52.7 | 11.5 | 35.8 | 2.93 |
| UA | 930 | 44.2 | 24.5 | 31.3 | 2.65 |

<!-- tables:end -->

## What changed since the first calibration

The first calibration (commit `f5b53020`, 9 October 2026) fitted the match engine's parameters to Série A, B, C and D results and to the Copa do Brasil's upsets. `pnpm calibrate` still reports the fitted and the in-use parameters side by side, and they agree within 0.015 on every parameter; the new effects were built to leave the average result unchanged, and most tickets' reports state that `pnpm calibrate` came out identical. What has been added on top, by commit:

| Effect | What it does to a match | Commit |
|---|---|---|
| Match injuries, fatigue, travel, pitch and adaptation | Lowers a side's strength when players are tired, injured or new | `173f0799` |
| Squad morale | Moves strength with the mood of the squad | `88b79cb7` |
| Cards, suspensions and the card tie-break | Yellows and reds at ESPN's measured rates; suspended players miss games | `44d601c6` |
| Formations, posture and the penalty taker | The eleven plays in a shape, and a side can attack or sit back | `9e089b9a` |
| Goal kinds, assists, CPU substitutions and skill shootouts | Changes who scores and how, not how often | `335571d1` |
| Counter posture, marking and play dials | The coach's four tactical dials | `56c021f3` |
| Real referees, wrong calls and VAR | A referee's own card and penalty habits; the VAR can undo a call | `6c77e87c` |
| Result-only world abroad | 62 leagues play a plain score draw at Série A's parameters | `839258e0`, `9a3f54ce`, `c2ef1a7a` |
| Each league abroad's own parameters and cards | A league abroad plays at its fitted (or guessed) params in both tiers, and the full tier books its players at its real card rates | this branch |
| Extra time at the world cups' goal rate | Ties after 90 minutes play 30 more | `42e73a3c` |
| National football (call-ups, absences, live national matches) | National squads take players from clubs during windows | `0e3ac861` and `30941c8c` |

Where a measured gap exists today it is in findings 2 and 3 (the lower divisions drift up in goals after season 1). `calibration.test.ts` and `paramsForLeagueAbroad.test.ts` hold every fitted league to its real rates on day one; no test here checks the drift, because the ten-season check that would (`expectResultsNearReal`) comes with its fix on `fix/calibration-drift`.

## Limits

- The real leagues abroad run from 2022/23 to 2025/26; the game starts in 2026 and the squads are those of Transfermarkt in October 2026. A league whose real level moved after 2022 (Eliteserien, MLS) differs from its sample for that reason too.
- The result-only tier plays straight round robins. MLS, Liga MX and Argentina play different formats and play-offs in the real world.
- Cards abroad cannot be compared with a simulation, because the result-only tier draws none. The table shows the real figures next to the rates the full tier uses. The English and Scottish files leave out the first yellow of a player sent off for a second, about 1% of their yellows (football-data.co.uk's notes.txt). Which reds are second yellows is not in the files; the game takes Série A's share.
- Competitions without real data (the continental cups, the Club World Cup, the national cups abroad, 39 of the 62 leagues abroad) appear for completeness. They carry no verdict. The leagues abroad keep Série A's strengthImpact and gapSaturation, as Série B–D do; how far apart their clubs are comes from Transfermarkt's market values alone.
