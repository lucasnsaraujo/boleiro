# Calibration report

Does the game still score goals, win, draw, lose and book players like the real leagues it was calibrated on, now that national football, referees with VAR, tactics, injuries and the world abroad play along?

The short answer: **Brazil's cards and Série A and D results match; Série B is on the edge and Série C scores too many goals after the first season; the leagues abroad do not match at all.** The sections below give the numbers, the method and what to do about each gap. Nothing here was fixed: this report only measures.

## Findings

1. **Série A passes** on home, draw, away and goals (2.46 goals a game against a real 2.49). **Série D passes** (2.41 against 2.24, inside its wide band, because the real sample is one season of 510 games).
2. **Série B fails by a hair**: away wins are 25.5% against 23.4% real and draws 26.4% against 28.7%, each a gap of 2.1 or 2.3 points inside a band of 2.1 or 2.2.
3. **Série C scores too much**: 2.38 goals a game against 2.22. The league is right on day one (2.26 in `pnpm calibrate`, which fields every club's real squad) and in season 1 of a run (2.28), then climbs to 2.45 by season 4. Série D drifts the same way (2.29 in season 1, 2.44 to 2.48 after). A run of Brazil alone, with no world abroad (`runSeasons`, six seeds, four seasons, same commit), drifts alike (Série C 2.22, 2.36, 2.35, 2.37; Série D 2.29, 2.41, 2.44, 2.46), so the world abroad and national football are not the cause. Something in the yearly squad turnover (transfers, youth, retirements) raises goals in the lower divisions. It needs its own investigation.
4. **Cards pass** for the three competitions with a real sample: Série A 5.04 yellows and 0.295 reds a game against 5.04 and 0.296, Série B 5.10 and 0.314 against 5.16 and 0.316, and the Copa do Brasil row (which also holds the continental cups, see below) 4.42 and 0.263 against 4.70 and 0.277. Série C, Série D and the estaduais have no real card data; they borrow Série B's or the cup's rates, so their match with the borrowed rate proves only that the engine applies it.
5. **The Copa do Brasil's upsets pass in 8 of 9 judged groups.** The known gap stays: a Série A club playing away at a Série B club wins 31% in the game against 53% real. The comment in `cupCalibration.test.ts` explains it: one symmetric home advantage cannot fit a Série A club at home to Série B (69% real, 62% in the game, 68% in `pnpm calibrate`) and away (53% real).
6. **Leagues abroad pass in 2 of the 23 that have a real reference** (LaLiga and Liga Portugal). Every league abroad plays with Série A's parameters, as a comment in `resultOnlyLeague.ts` says (`guess: until each league has its own fit`). The errors are systematic: the home side wins 46–48% of games everywhere, where the real figure runs from 39.8% (Austria) to 46.7% (Norway and Scotland); goals sit between 2.48 and 2.71 in every league with a reference, where the real figure runs from 2.11 (Argentina) to 3.19 (Germany's Bundesliga). The Premier League plays 2.52 goals a game against a real 2.95, the Eredivisie 2.69 against 3.12, the Bundesliga 2.63 against 3.19.
7. **Cards abroad are Série A's.** A league abroad has no cards in the result-only tier, and a human coach who takes a club abroad plays with Série A's rates (5.04 yellows, 0.296 reds a game, `cardCompetitionOf` in `cardRates.ts`). The real leagues run from 3.00 yellows (Eredivisie) to 5.18 (Greece), and from 0.109 reds (Championship) to 0.285 (Liga Portugal).
8. **Some small leagues play oddly.** Cyprus' second division has 18% draws and 3.11 goals a game, Venezuela 22.6% draws and 2.87 goals, the Saudi Pro League 22.4% draws and 2.84 goals. No real reference was fetched for them. Most likely their squads have wide strength gaps from sparse Transfermarkt data. Check them before trusting them.

What to do, in order of value: fit one parameter set per league abroad from football-data.co.uk (the files hold results and, for most leagues, closing odds); look for the lower-division drift of finding 3; give the leagues abroad their own card rates.

## How the numbers are made

- **Simulation.** `worldCalibrationRun` plays the v1 world (Brazil in the full tier, 62 leagues abroad result-only, 1,344 clubs) with no human coach, for four seasons from 2026, on ten seeds (1 to 10). Four seasons give three finished seasons of every league that runs across the new year: the first of them starts in August 2026.
- **Commit.** The tables carry the commit they were generated at. A change in the engine, the data or a seeded stream moves the seeds' games, so a later run can differ by a fraction of a point without the game having changed; the bands are wider than that.
- **Reproduce.** `pnpm calibration:report --seeds 10 --seasons 4 --write docs/calibration-report.md` replaces the tables below. It takes about two minutes. The seeds make the numbers repeat exactly.
- **Real data for Brazil.** The data the engine was calibrated on, read by `pnpm calibrate`: Série A results from 2022 on, with closing odds (`data/history/brasileirao-serie-a-odds.csv`, football-data.co.uk, 1,809 games); Série B, C and D results (Sofascore for 2024, ESPN for the other seasons: 1,840, 864 and 510 games); Copa do Brasil 2017–2025 between divisions; yellow and red cards of Série A, Série B and the Copa do Brasil 2024–2025 (ESPN match summaries: 760, 760 and 141 games). Rows and sources are in `data/SOURCES.md`.
- **Real data for the leagues abroad.** New for this report: `data/history/football-data/league-rates.csv`, built by `pipeline/fetch_football_data_rates.py` from football-data.co.uk. The 17 European leagues are the finished seasons 2022/23 to 2025/26, with cards. Argentina, the USA, Mexico, Norway, Austria and Poland are the calendar years 2022–2025 (Mexico and Austria and Poland by season), goals only. The files list every finished game, so Argentina's, MLS' and Liga MX's counts include play-offs and cups that the result-only tier does not play. No engine parameter is fitted to this file.
- **The band.** A number passes when the simulated value is within `max(floor, 2 × standard error)` of the real one. The standard error covers both samples (real and simulated). The floor is the tolerance of the engine's own calibration tests (`calibration.test.ts`): 2 points on a result share and 0.10 goals for Série A and B, 2.5 points for Série C, 4 points and 0.20 goals for Série D, and the Série B floor for leagues abroad. Cards use a floor of 0.30 yellows and 0.05 reds. Cup shares use 5 points. A verdict lists each failed metric with its gap and band.
- **Spread of goals.** The real variance of goals a game comes from the real data where the file holds it (the leagues abroad) and from the simulation otherwise.
- **Cards in the "Copa do Brasil and the continental cups" row.** `cardCompetitionOf` gives the Copa do Brasil, the continental cups and national football the same card rates, so the game reports them as one competition. The real row is the Copa do Brasil's.
- **Group sizes.** A cup group the simulation filled with fewer than 30 matches is shown but not judged.

## Results

<!-- tables:start -->

Generated by `pnpm calibration:report --seeds 10 --seasons 4`: 10 seeds (1 to 10) × 4 seasons of the v1 world, no human coach, starting in 2026, at commit c8666f2f.

## Verdicts at a glance

| Check | Passed |
|---|---|
| Brazil league results (home, draw, away and goals per division) | 2 of 4 divisions |
| Brazil cards (Série A, B and the Copa do Brasil, the ones with a real sample) | 6 of 6 numbers |
| Copa do Brasil results by division gap and venue | 8 of 9 groups |
| Leagues abroad with real results | 2 of 23 leagues |

## Brazil's leagues

| Division | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed | Verdict |
|---|---|---|---|---|---|---|---|---|
| Série A | 15200 | 1809 | 45.9 / 47.2 | 27.3 / 26.9 | 26.7 / 25.9 | 2.46 / 2.49 | 2.38–2.51 | pass |
| Série B | 15200 | 1840 | 48.1 / 47.9 | 26.4 / 28.7 | 25.5 / 23.4 | 2.25 / 2.17 | 2.18–2.33 | fail: draw −2.3 (band 2.2); away +2.1 (band 2.1) |
| Série C | 11220 | 864 | 48.5 / 47.7 | 27.3 / 30.1 | 24.2 / 22.2 | 2.38 / 2.22 | 2.28–2.52 | fail: goals +0.16 (band 0.11) |
| Série D | 24400 | 510 | 45.6 / 45.5 | 27.5 / 30.2 | 26.9 / 24.3 | 2.41 / 2.24 | 2.31–2.49 | pass |

### Brazil's leagues by season

Goals per game, then home win % in brackets, over all seeds.

| Division | Real | Season 1 | Season 2 | Season 3 | Season 4 |
|---|---|---|---|---|---|
| Série A | 2.49 (47.2) | 2.48 (43.6) | 2.52 (47.6) | 2.39 (46.7) | 2.46 (45.7) |
| Série B | 2.17 (47.9) | 2.13 (47.4) | 2.38 (48.9) | 2.24 (49.4) | 2.25 (46.6) |
| Série C | 2.22 (47.7) | 2.28 (49.1) | 2.35 (48.7) | 2.42 (46.9) | 2.45 (49.6) |
| Série D | 2.24 (45.5) | 2.29 (44.9) | 2.43 (45.5) | 2.48 (46.1) | 2.44 (45.8) |

## Brazil's cards

| Competition | Games B | Yellows/game B | Yellows/game real | Reds/game B | Reds/game real | Verdict |
|---|---|---|---|---|---|---|
| Série A | 15200 | 5.04 | 5.04 | 0.295 | 0.296 | pass |
| Série B | 15200 | 5.10 | 5.16 | 0.314 | 0.316 | pass |
| Série C | 11220 | 5.11 | 5.16 | 0.321 | 0.316 | no real sample, rates borrowed from Série B |
| Série D | 24400 | 5.11 | 5.16 | 0.314 | 0.316 | no real sample, rates borrowed from Série B |
| Copa do Brasil and the continental cups | 19590 | 4.42 | 4.70 | 0.263 | 0.277 | pass |
| Estaduais | 30840 | 4.65 | 4.70 | 0.279 | 0.277 | no real sample, rates borrowed from the Copa do Brasil |

## Copa do Brasil upsets

| Gap | Favourite plays | Games B | Games real | Favourite wins % B / real | Draws % B / real | Loses % B / real | Verdict |
|---|---|---|---|---|---|---|---|
| AvB | home | 346 | 74 | 62 / 69 | 24 / 19 | 14 / 12 | pass |
| AvB | away | 343 | 75 | 31 / 53 | 32 / 27 | 37 / 20 | fail: win −23 (band 13); loss +17 (band 10) |
| AvC | home | 154 | 43 | 71 / 79 | 20 / 16 | 9 / 5 | pass |
| AvC | away | 154 | 49 | 47 / 39 | 31 / 29 | 22 / 33 | pass |
| AvD | home | 110 | 45 | 84 / 87 | 15 / 11 | 2 / 2 | pass |
| AvD | away | 110 | 125 | 62 / 61 | 21 / 30 | 17 / 10 | pass |
| BvC | home | 4 | 17 | - | - | - | too few simulated games, not judged |
| BvC | away | 166 | 24 | 32 / 21 | 31 / 42 | 37 / 38 | pass |
| BvD | home | 0 | 24 | - | - | - | too few simulated games, not judged |
| BvD | away | 1382 | 155 | 48 / 43 | 29 / 32 | 23 / 26 | pass |
| CvD | home | 0 | 13 | - | - | - | too few simulated games, not judged |
| CvD | away | 1066 | 91 | 38 / 42 | 29 / 23 | 32 / 35 | pass |

## Leagues abroad: results

| League | League seasons B / real | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed-run | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Liga Profesional (AR1) | 40 / 4 | 17400 | 2254 | 46.9 / 42.7 | 25.8 / 32.0 | 27.3 / 25.3 | 2.54 / 2.11 | 2.49–2.58 | fail: home +4.2 (band 2.2); draw −6.1 (band 2.1); goals +0.43 (band 0.10) |
| Bundesliga (AT1) | 30 / 4 | 3960 | 774 | 46.6 / 39.8 | 25.5 / 27.0 | 27.9 / 33.2 | 2.58 / 2.75 | 2.44–2.69 | fail: home +6.8 (band 3.8); away −5.3 (band 3.7); goals −0.17 (band 0.13) |
| Jupiler Pro League (BE1) | 30 / 4 | 9180 | 1241 | 46.4 / 43.3 | 26.2 / 25.6 | 27.4 / 31.1 | 2.52 / 2.82 | 2.47–2.57 | fail: home +3.1 (band 3.0); away −3.7 (band 2.8); goals −0.30 (band 0.10) |
| Bundesliga (DE1) | 30 / 4 | 9180 | 1224 | 48.0 / 43.4 | 24.9 / 25.2 | 27.1 / 31.5 | 2.63 / 3.19 | 2.57–2.72 | fail: home +4.6 (band 3.0); away −4.3 (band 2.8); goals −0.56 (band 0.11) |
| 2. Bundesliga (DE2) | 30 / 4 | 9180 | 1224 | 46.7 / 44.7 | 26.8 / 24.8 | 26.5 / 30.5 | 2.48 / 3.00 | 2.41–2.57 | fail: away −4.0 (band 2.8); goals −0.52 (band 0.11) |
| LaLiga (ES1) | 30 / 4 | 11400 | 1520 | 47.3 / 46.3 | 23.7 / 25.4 | 28.9 / 28.3 | 2.70 / 2.62 | 2.63–2.80 | pass |
| LaLiga2 (ES2) | 30 / 4 | 13860 | 1848 | 46.2 / 45.5 | 26.0 / 29.1 | 27.8 / 25.4 | 2.54 / 2.36 | 2.48–2.61 | fail: draw −3.1 (band 2.3); away +2.3 (band 2.2); goals +0.18 (band 0.10) |
| Ligue 1 (FR1) | 30 / 4 | 9180 | 1298 | 46.2 / 43.7 | 26.0 / 23.9 | 27.8 / 32.4 | 2.58 / 2.83 | 2.50–2.73 | fail: away −4.6 (band 2.8); goals −0.24 (band 0.10) |
| Ligue 2 (FR2) | 30 / 4 | 9180 | 1370 | 46.5 / 42.6 | 26.1 / 27.5 | 27.4 / 29.9 | 2.49 / 2.49 | 2.42–2.56 | fail: home +3.9 (band 2.9) |
| Premier League (GB-ENG1) | 30 / 4 | 11400 | 1520 | 46.4 / 44.5 | 27.1 / 24.1 | 26.6 / 31.4 | 2.52 / 2.95 | 2.47–2.58 | fail: draw +3.0 (band 2.3); away −4.9 (band 2.5); goals −0.44 (band 0.10) |
| Championship (GB-ENG2) | 30 / 4 | 16560 | 2208 | 46.7 / 43.3 | 25.9 / 26.3 | 27.4 / 30.4 | 2.56 / 2.54 | 2.50–2.62 | fail: home +3.4 (band 2.2); away −3.1 (band 2.1) |
| Scottish Premiership (GB-SCT1) | 30 / 4 | 3960 | 912 | 47.3 / 46.7 | 24.2 / 23.0 | 28.5 / 30.3 | 2.70 / 2.86 | 2.56–2.74 | fail: goals −0.16 (band 0.12) |
| Scottish Championship (GB-SCT2) | 30 / 4 | 2700 | 720 | 45.9 / 40.7 | 27.9 / 28.3 | 26.2 / 31.0 | 2.55 / 2.63 | 2.42–2.70 | fail: home +5.2 (band 4.1); away −4.7 (band 3.9) |
| Super League 1 (GR1) | 30 / 4 | 5460 | 949 | 46.6 / 41.6 | 23.7 / 26.7 | 29.8 / 31.7 | 2.66 / 2.58 | 2.55–2.77 | fail: home +5.0 (band 3.5) |
| Serie A (IT1) | 30 / 4 | 11400 | 1520 | 46.8 / 40.7 | 25.3 / 27.6 | 27.9 / 31.7 | 2.60 / 2.54 | 2.56–2.62 | fail: home +6.1 (band 2.7); away −3.8 (band 2.5) |
| Serie B (IT2) | 30 / 4 | 11400 | 1520 | 46.6 / 40.6 | 26.5 / 32.3 | 26.9 / 27.1 | 2.57 / 2.47 | 2.50–2.65 | fail: home +6.0 (band 2.7); draw −5.8 (band 2.6) |
| Liga MX (MX1) | 40 / 4 | 12240 | 1358 | 46.3 / 46.0 | 27.1 / 25.8 | 26.6 / 28.2 | 2.59 / 2.82 | 2.51–2.70 | fail: goals −0.23 (band 0.10) |
| Eredivisie (NL1) | 30 / 4 | 9180 | 1224 | 47.2 / 44.4 | 23.7 / 25.0 | 29.1 / 30.6 | 2.69 / 3.12 | 2.63–2.76 | fail: goals −0.43 (band 0.11) |
| Eliteserien (NO1) | 40 / 4 | 9600 | 966 | 46.6 / 46.7 | 26.3 / 21.3 | 27.0 / 32.0 | 2.58 / 3.09 | 2.53–2.66 | fail: draw +5.0 (band 2.8); away −5.0 (band 3.1); goals −0.51 (band 0.12) |
| Ekstraklasa (PL1) | 30 / 4 | 9180 | 1224 | 46.3 / 43.9 | 26.3 / 27.5 | 27.5 / 28.7 | 2.54 / 2.66 | 2.50–2.58 | fail: goals −0.12 (band 0.10) |
| Liga Portugal (PT1) | 30 / 4 | 9180 | 1224 | 46.8 / 44.2 | 23.8 / 23.9 | 29.4 / 31.9 | 2.67 / 2.65 | 2.61–2.75 | pass |
| Süper Lig (TR1) | 30 / 4 | 9180 | 1370 | 47.6 / 45.4 | 23.7 / 25.0 | 28.7 / 29.6 | 2.71 / 2.86 | 2.61–2.77 | fail: goals −0.15 (band 0.10) |
| MLS (US1) | 40 / 4 | 17400 | 2072 | 47.0 / 46.6 | 27.1 / 26.0 | 25.9 / 27.5 | 2.69 / 2.96 | 2.65–2.73 | fail: goals −0.28 (band 0.10) |

## Leagues abroad: cards

| League | Real games with cards | Yellows/game real | Yellows/game, full tier abroad | Reds/game real | Reds/game, full tier abroad |
|---|---|---|---|---|---|
| Premier League (GB-ENG1) | 1520 | 3.89 | 5.04 | 0.116 | 0.296 |
| Championship (GB-ENG2) | 2208 | 3.79 | 5.04 | 0.109 | 0.296 |
| LaLiga (ES1) | 1520 | 4.67 | 5.04 | 0.265 | 0.296 |
| LaLiga2 (ES2) | 1848 | 4.89 | 5.04 | 0.260 | 0.296 |
| Serie A (IT1) | 1520 | 4.09 | 5.04 | 0.183 | 0.296 |
| Serie B (IT2) | 1520 | 4.92 | 5.04 | 0.247 | 0.296 |
| Bundesliga (DE1) | 1223 | 3.99 | 5.04 | 0.168 | 0.296 |
| 2. Bundesliga (DE2) | 1224 | 4.51 | 5.04 | 0.198 | 0.296 |
| Ligue 1 (FR1) | 1298 | 3.67 | 5.04 | 0.240 | 0.296 |
| Ligue 2 (FR2) | 1369 | 3.71 | 5.04 | 0.226 | 0.296 |
| Liga Portugal (PT1) | 1224 | 5.13 | 5.04 | 0.285 | 0.296 |
| Eredivisie (NL1) | 1224 | 3.00 | 5.04 | 0.160 | 0.296 |
| Süper Lig (TR1) | 1339 | 4.55 | 5.04 | 0.222 | 0.296 |
| Jupiler Pro League (BE1) | 1238 | 3.87 | 5.04 | 0.219 | 0.296 |
| Scottish Premiership (GB-SCT1) | 912 | 3.75 | 5.04 | 0.194 | 0.296 |
| Scottish Championship (GB-SCT2) | 720 | 3.92 | 5.04 | 0.157 | 0.296 |
| Super League 1 (GR1) | 948 | 5.18 | 5.04 | 0.258 | 0.296 |

## Leagues abroad without a real reference

| League | League seasons | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|---|
| Premier League (AM1) | 30 | 3960 | 46.6 | 27.3 | 26.0 | 2.50 |
| First League (AM2) | 30 | 6300 | 46.2 | 27.7 | 26.1 | 2.43 |
| Primera Nacional (AR2) | 40 | 25200 | 45.8 | 27.7 | 26.4 | 2.44 |
| 2. Liga (AT2) | 30 | 7200 | 45.9 | 29.4 | 24.6 | 2.40 |
| Premyer Liqa (AZ1) | 30 | 3960 | 44.9 | 28.6 | 26.5 | 2.39 |
| Challenger Pro League (BE2) | 30 | 6300 | 46.3 | 27.1 | 26.6 | 2.45 |
| efbet Liga (BG1) | 30 | 5460 | 46.8 | 25.6 | 27.6 | 2.52 |
| Vtora Liga (BG2) | 30 | 9180 | 46.3 | 28.0 | 25.7 | 2.43 |
| División Profesional (BO1) | 40 | 9600 | 44.8 | 29.1 | 26.2 | 2.39 |
| Liga de Primera (CL1) | 40 | 9600 | 45.6 | 28.0 | 26.4 | 2.46 |
| Liga Dimayor (CO1) | 40 | 15200 | 46.8 | 27.1 | 26.1 | 2.49 |
| Cyprus League (CY1) | 30 | 5460 | 46.1 | 26.3 | 27.5 | 2.54 |
| 2. Division (CY2) | 30 | 7200 | 46.9 | 18.2 | 34.9 | 3.11 |
| Chance Liga (CZ1) | 30 | 7200 | 47.3 | 24.5 | 28.2 | 2.57 |
| Chance Národní Liga (CZ2) | 30 | 7200 | 45.7 | 28.4 | 25.9 | 2.40 |
| LigaPro Serie A (EC1) | 40 | 9600 | 46.4 | 27.1 | 26.5 | 2.44 |
| Super League 2 (GR2) | 30 | 7200 | 45.7 | 28.6 | 25.8 | 2.43 |
| SuperSport HNL (HR1) | 30 | 2700 | 46.9 | 25.1 | 27.9 | 2.70 |
| Prva Nogometna Liga (HR2) | 30 | 7200 | 45.6 | 27.7 | 26.7 | 2.54 |
| Nemzeti Bajnokság (HU1) | 30 | 3960 | 47.2 | 26.4 | 26.4 | 2.54 |
| Nemzeti Bajnokság II (HU2) | 30 | 7200 | 46.0 | 28.4 | 25.6 | 2.40 |
| Ligat ha'Al (IL1) | 30 | 5460 | 48.2 | 25.5 | 26.4 | 2.62 |
| Liga Leumit (IL2) | 30 | 7200 | 46.1 | 27.9 | 26.0 | 2.52 |
| Keuken Kampioen Divisie (NL2) | 30 | 11400 | 47.4 | 27.7 | 25.0 | 2.45 |
| OBOS-ligaen (NO2) | 40 | 9600 | 45.6 | 27.6 | 26.9 | 2.49 |
| Liga 1 (PE1) | 40 | 12240 | 45.9 | 28.1 | 26.0 | 2.39 |
| I liga (PL2) | 30 | 9180 | 46.2 | 27.6 | 26.2 | 2.46 |
| Liga Portugal 2 (PT2) | 30 | 9180 | 45.9 | 27.2 | 27.0 | 2.40 |
| Primera División (PY1) | 40 | 5280 | 46.3 | 25.7 | 28.0 | 2.55 |
| Saudi Pro League (SA1) | 30 | 9180 | 48.4 | 22.4 | 29.2 | 2.84 |
| Prva Liga (SI1) | 30 | 2700 | 45.8 | 27.2 | 27.0 | 2.46 |
| Druga Liga (SI2) | 30 | 7200 | 47.1 | 28.2 | 24.7 | 2.42 |
| Niké Liga (SK1) | 30 | 3960 | 47.4 | 26.1 | 26.4 | 2.51 |
| MONACObet Liga (SK2) | 30 | 7200 | 45.4 | 28.2 | 26.3 | 2.42 |
| 1. Lig (TR2) | 30 | 11400 | 46.8 | 27.3 | 25.9 | 2.54 |
| Premier Liga (UA1) | 30 | 7200 | 47.3 | 23.9 | 28.7 | 2.59 |
| Persha Liga (UA2) | 30 | 7200 | 45.8 | 26.8 | 27.4 | 2.45 |
| Liga AUF (UY1) | 40 | 9600 | 47.2 | 26.8 | 26.1 | 2.51 |
| Liga FUTVE (VE1) | 40 | 8400 | 47.3 | 22.6 | 30.1 | 2.87 |

## Other competitions the game plays with a full match engine

| Competition | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|
| club-world-cup | 630 | 38.9 | 30.8 | 30.3 | 1.85 |
| cup | 6200 | 39.8 | 28.4 | 31.8 | 2.26 |
| intercontinental-cup | 200 | 51.5 | 18.5 | 30.0 | 2.54 |
| libertadores | 6200 | 49.8 | 27.4 | 22.7 | 2.30 |
| recopa | 80 | 46.3 | 31.3 | 22.5 | 2.33 |
| state | 30840 | 50.3 | 25.8 | 23.9 | 2.40 |
| sul-americana | 6280 | 49.5 | 28.7 | 21.8 | 2.27 |

## National cups abroad, result-only

| Cup of | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|
| AM | 780 | 54.5 | 12.4 | 33.1 | 2.85 |
| AT | 810 | 54.2 | 13.0 | 32.8 | 2.90 |
| AZ | 330 | 54.5 | 15.5 | 30.0 | 2.62 |
| BE | 960 | 54.9 | 10.8 | 34.3 | 2.91 |
| BG | 930 | 54.2 | 13.0 | 32.8 | 2.86 |
| CY | 870 | 54.0 | 11.3 | 34.7 | 3.13 |
| CZ | 930 | 51.9 | 12.0 | 36.0 | 2.82 |
| DE | 1050 | 52.5 | 11.3 | 36.2 | 2.82 |
| ES | 1230 | 54.3 | 11.1 | 34.6 | 2.99 |
| FR | 1050 | 46.5 | 22.2 | 31.3 | 2.74 |
| GB-ENG | 1290 | 52.6 | 12.9 | 34.5 | 2.81 |
| GB-SCT | 630 | 53.2 | 12.1 | 34.8 | 2.95 |
| GR | 870 | 47.2 | 22.8 | 30.0 | 2.69 |
| HR | 750 | 53.5 | 11.5 | 35.1 | 2.87 |
| HU | 810 | 53.2 | 12.7 | 34.1 | 2.80 |
| IL | 870 | 50.3 | 13.6 | 36.1 | 2.84 |
| IT | 1170 | 48.5 | 23.8 | 27.8 | 2.66 |
| NL | 1110 | 51.0 | 11.6 | 37.4 | 2.94 |
| NO | 1240 | 54.8 | 12.4 | 32.7 | 2.80 |
| PL | 1050 | 55.6 | 12.3 | 32.1 | 2.77 |
| PT | 1050 | 52.6 | 13.5 | 33.9 | 2.84 |
| SI | 750 | 57.5 | 12.8 | 29.7 | 2.72 |
| SK | 810 | 48.5 | 25.1 | 26.4 | 2.57 |
| TR | 1110 | 52.4 | 12.3 | 35.3 | 2.90 |
| UA | 930 | 42.8 | 24.8 | 32.4 | 2.65 |

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
| Extra time at the world cups' goal rate | Ties after 90 minutes play 30 more | `42e73a3c` |
| National football (call-ups, absences, live national matches) | National squads take players from clubs during windows | `0e3ac861` and `30941c8c` |

Where a measured gap exists today it is in finding 3 (the lower divisions drift up in goals after season 1) and in the leagues abroad (findings 6 and 7). No test in the repository checks the first; the full-season e2e and `runSeasons.test.ts` check money, strength and age bands but not goals per division.

## Limits

- The real leagues abroad run from 2022/23 to 2025/26; the game starts in 2026 and the squads are those of Transfermarkt in October 2026. A league whose real level moved after 2022 (Eliteserien, MLS) differs from its sample for that reason too.
- The result-only tier plays straight round robins. MLS, Liga MX and Argentina play different formats and play-offs in the real world.
- Cards abroad cannot be compared with a simulation, because the result-only tier draws none. The table shows the real figures next to the rates the full tier would use.
- Competitions without real data (the continental cups, the Club World Cup, the national cups abroad, 39 of the 62 leagues abroad) appear for completeness. They carry no verdict.
