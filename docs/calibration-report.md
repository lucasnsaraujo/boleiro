# Calibration report

Does the game still score goals, win, draw, lose and book players like the real leagues it was calibrated on, now that national football, referees with VAR, tactics, injuries and the world abroad play along?

The short answer: **every league abroad with a real reference plays like itself, and every Brazilian division matches its real results season after season.** The lower divisions no longer drift up after the first season, and their squads no longer spread wider season after season (finding 4). One cup group, a Série C club away at a Série D club, now draws a point more often than its band allows (finding 8).

## Findings

1. **Every Brazilian division passes** over four seasons: Série A 2.42 goals a game against a real 2.49, Série B 2.16 against 2.17, Série C 2.27 against 2.22 (band 0.11) and Série D 2.31 against 2.24. Season by season, Série C plays 2.23, 2.26, 2.30 and 2.28 goals a game and Série D 2.30, 2.30, 2.31 and 2.34, where without the fix they climb to 2.45 and 2.50 by season 4.
2. **Why the lower divisions drifted: promotion and relegation.** Every season each player drifted 15% of the way toward his division's level (`CLUB_LEVEL`, 72, 63, 56 and 49 for Série A to D), and a club that changed division kept its squad. So a promoted club arrived 5 to 8 points below its new division and a relegated one as far above it: one seed's first rollover took the spread of club ratings inside Série C from 1.4 to 4.1 points (the clubs that stayed: 1.0). Wider gaps mean more lopsided games, so more goals and fewer draws. Real moved clubs are nothing like that. In their first season after the move, 2016–2026, clubs promoted to Série A, B and C took 1.14, 1.31 and 1.33 points a game and clubs relegated to Série B and C 1.53 and 1.38, against 1.43, 1.31 and 1.34 for the clubs that stayed (ESPN's and Sofascore's results with `divisions.csv`, Série A's from the odds file). In the game they took 0.74, 0.84, 0.95, 1.93 and 1.95 (six seeds, seasons 2–4).
3. **The fix has five parts** (`sim/players/developPlayers.ts`, `sim/finances/renewFinances.ts`).
   - Players drift toward the level their club's revenue buys inside its division: across Brazil's 281 clubs on day one, squad level follows log revenue (R² 0.97), and inside a division it rises 1.8 points per e-fold of revenue. A club's level is its division's `CLUB_LEVEL` moved by that much, so a division keeps the spread its money makes instead of converging on one level.
   - An AI club that goes up or down rebuilds 85% of the way from where its squad stands to its new level (`rebuildMovedSquads`), as a real club does over the summer; a human coach rebuilds his own. Moved clubs now take 1.10, 1.10 and 1.19 points a game promoted and 1.66 and 1.57 relegated.
   - A relegated club richer than any club in its new division's data keeps the squad its money buys at the rate across divisions (5.19 points per e-fold over all 281 clubs, R² 0.97). Without it Internacional, relegated with R$ 292 million, arrived in Série B barely above the average and went down again to Série C.
   - A promoted club earns at least the least any club of its new division does (the data's small estimate; Série A's lowest accounts). Without it a club that climbed from its estadual to Série C opened on R$ 4.2 million, under half the smallest real Série C club's R$ 9 million.
   - Squads keep the 2026 squads' position shape (479 keepers, 1,455 defenders, 1,285 midfielders and 1,093 forwards in Série A to D) instead of a guessed 3, 8, 8 and 5 per 24. Under the guess, squads lost a quarter of their forwards: Série A clubs went from 9.2 to 6.1 in six seasons and fielded weaker attacks, and the lower divisions' defences spread apart.
4. **The ten-season spread check passes again: newcomers now land where real ones do.** `expectSpreadSettles` (in `runSeasons.test.ts` and `strengthBySeason.test.ts`) failed because squads widened year after year: on seed 2, Série B's players' p90–p10 spread went from 9.6 in 2027 to 13.2 in 2036, and inside its clubs their strength net of age spread from 2.85 to 4.47 points (one standard deviation). Player development was not the cause. A player who stays at his club changes 1.55 points a year (net of age and of his club's change), and the 2026 Série B players who stayed at their clubs between their Transfermarkt values of mid-2025 and mid-2026 changed 1.43 on the game's scale (88 players; `data/SOURCES.md`). The newcomers were. A third of a Série B squad is new each season, and the newcomers arrived spread 4.3 points around their club's mean (root mean square), against the squad's own 2.85: Série A players signed on pre-contracts landed 6.3 points above their Série B squad (±4.4), and academy graduates 1.7 above (±4.1). The 2026 squads' arrivals of the year stand 0.3 above theirs (±2.8; from Série A 1.4), and their players aged 20 to 23 at their club's level. Three changes put the newcomers there (`sim/transfers/tradeBetweenClubs.ts`, `sim/transfers/marketView.ts`, `sim/players/developPlayers.ts`). An AI club signs a pre-contract only with a player his AI club would not keep, and counts the players joining it in its needs and wage bill while they wait. A full squad upgrades its weakest starter by 1 to 5 points instead of 10. An AI club's academy graduates drift toward its level instead of their potential; a human coach's still grow toward theirs. On seed 2 the spread now runs from 9.3 in 2027 to 9.8 in 2036 in Série B, 8.8 to 9.8 in Série C and 8.3 (2029) to 9.5 in Série D; over seeds 1 to 8 the check holds in 31 of the 32 division-seeds, against 13 before (Série C on seed 6 misses by 0.7). Squads still widen a little inside clubs (Série B 2.85 to 3.6 over ten seasons): minutes and form still feed a player's strength into his next season.
5. **Série A's own ten-season sag.** Over seasons 2–10 Série A scores 2.37 to 2.45 goals a game on five seeds, against a real 2.49, one of the five outside its band: its squads thin from 33.6 players to about 29 and its best forwards fade. Over four seasons it passes. The ten-season results check leaves Série A out for that reason. Série B (2.17 to 2.20), Série C (2.27 to 2.33) and Série D (2.33 to 2.39) hold on all five.
6. **The first season moves a little**: the position shape changes which positions the market signs from day one, so Série A plays 2.47 goals a game in season 1 of the runs, against 2.48 before them. `pnpm calibrate` fields every club's squad on day one, where the shape also picks the generated players that fill short squads: ten Série D clubs field another keeper or defender, so its fit for Série D and the cup moves in the fourth decimal (Série D's home advantage 0.4098 against 0.4101, the cup's 0.5249 against 0.5241). The params in use and every other fit are unchanged.
7. **Cards pass** for the three competitions with a real sample: Série A 5.01 yellows and 0.294 reds a game against 5.04 and 0.296, Série B 5.13 and 0.316 against 5.16 and 0.316, and the Copa do Brasil row (which also holds the continental cups) 4.43 and 0.263 against 4.70 and 0.277. Série C, Série D and the estaduais have no real card data; they borrow Série B's or the cup's rates.
8. **The Copa do Brasil's upsets pass in 7 of 9 judged groups.** The known gap stays: a Série A club playing away at a Série B club wins 32% in the game against 53% real. The comment in `cupCalibration.test.ts` explains it: one symmetric home advantage cannot fit a Série A club at home to Série B and away. The new one is small: a Série C club away at a Série D club draws 33% against 23% real, 10 points over against a band of 9, where it drew 32% before finding 4's fix. With squads no longer widening, Série C's best players stay near their day-one level (its p90 60.5 in 2030 against 60.0 on day one and 62.3 before the fix, seeds 1 to 4), so its elevens beat Série D's a little less often. On seeds 11 to 30 the group passes both before and after the fix (30% and 31% draws), and the first season alone, on squads close to day one's, already draws 31% (seeds 1 to 20): the excess comes from the cup's own strength curve, which the drift had been hiding.
9. **Leagues abroad pass in 23 of the 23 that have a real reference**, against 2 before. Each league plays at its own params, fitted by `pnpm calibrate` to football-data.co.uk's results the way Série B–D are fitted to theirs (baseGoals, homeAdvantage and lowScoreCorrelation, on the clubs' result-only elevens at the game's start), and the result-only tier and the full tier read the same table (`paramsForLeagueAbroad`). Over four seasons the Bundesliga plays 3.21 goals a game against 3.19, the Premier League 2.98 against 2.95, Argentina 2.13 against 2.11, and Austria's home side wins 39.5% against 39.8%.
10. **Cards abroad are each league's own** where football-data.co.uk lists them: 17 European leagues, from 3.00 yellows a game (Eredivisie) to 5.18 (Greece), split by side as the real games are. The full tier draws a human coach's club abroad at its league's rates (`LEAGUE_ABROAD_CARD_RATES`), and so does a result-only match told again on its page; Argentina, the USA, Mexico, Norway, Austria, Poland and the leagues without a reference borrow Série A's.
11. **Leagues without a real reference** (39 of the 62) play at a labelled guess: a South American league at Brazil's division of its level, a European one or the Saudi Pro League at the median fitted European league of its level. Some still play oddly: Cyprus' second division has 18.8% draws and 3.11 goals a game, the Saudi Pro League 22.4% and 3.06. Most likely their squads have wide strength gaps from sparse Transfermarkt data.

What to do, in order of value: fetch real results for the 39 leagues without a reference; look at Série A's thinning squads (finding 5); look at the cup's draws between Série C and D (finding 8).

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

Generated by `pnpm calibration:report --seeds 10 --seasons 4`: 10 seeds (1 to 10) × 4 seasons of the v1 world, no human coach, starting in 2026, at commit ee00d0e0.

## Verdicts at a glance

| Check | Passed |
|---|---|
| Brazil league results (home, draw, away and goals per division) | 4 of 4 divisions |
| Brazil cards (Série A, B and the Copa do Brasil, the ones with a real sample) | 6 of 6 numbers |
| Copa do Brasil results by division gap and venue | 7 of 9 groups |
| Leagues abroad with real results | 23 of 23 leagues |

## Brazil's leagues

| Division | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed | Verdict |
|---|---|---|---|---|---|---|---|---|
| Série A | 15200 | 1809 | 45.5 / 47.2 | 28.2 / 26.9 | 26.3 / 25.9 | 2.42 / 2.49 | 2.34–2.46 | pass |
| Série B | 15200 | 1840 | 47.3 / 47.9 | 28.9 / 28.7 | 23.8 / 23.4 | 2.16 / 2.17 | 2.11–2.23 | pass |
| Série C | 11220 | 864 | 47.8 / 47.7 | 29.5 / 30.1 | 22.7 / 22.2 | 2.27 / 2.22 | 2.21–2.38 | pass |
| Série D | 24400 | 510 | 45.7 / 45.5 | 29.1 / 30.2 | 25.1 / 24.3 | 2.31 / 2.24 | 2.25–2.37 | pass |

### Brazil's leagues by season

Goals per game, then home win % in brackets, over all seeds.

| Division | Real | Season 1 | Season 2 | Season 3 | Season 4 |
|---|---|---|---|---|---|
| Série A | 2.49 (47.2) | 2.47 (46.0) | 2.42 (44.7) | 2.43 (45.9) | 2.36 (45.4) |
| Série B | 2.17 (47.9) | 2.14 (47.3) | 2.19 (46.2) | 2.13 (48.1) | 2.16 (47.8) |
| Série C | 2.22 (47.7) | 2.23 (49.0) | 2.26 (47.4) | 2.30 (47.5) | 2.28 (47.7) |
| Série D | 2.24 (45.5) | 2.30 (45.0) | 2.30 (45.4) | 2.31 (45.3) | 2.34 (47.2) |

## Brazil's cards

| Competition | Games B | Yellows/game B | Yellows/game real | Reds/game B | Reds/game real | Verdict |
|---|---|---|---|---|---|---|
| Série A | 15200 | 5.01 | 5.04 | 0.294 | 0.296 | pass |
| Série B | 15200 | 5.13 | 5.16 | 0.316 | 0.316 | pass |
| Série C | 11220 | 5.09 | 5.16 | 0.315 | 0.316 | no real sample, rates borrowed from Série B |
| Série D | 24400 | 5.10 | 5.16 | 0.310 | 0.316 | no real sample, rates borrowed from Série B |
| Copa do Brasil and the continental cups | 19590 | 4.43 | 4.70 | 0.263 | 0.277 | pass |
| Estaduais | 30840 | 4.65 | 4.70 | 0.276 | 0.277 | no real sample, rates borrowed from the Copa do Brasil |

## Copa do Brasil upsets

| Gap | Favourite plays | Games B | Games real | Favourite wins % B / real | Draws % B / real | Loses % B / real | Verdict |
|---|---|---|---|---|---|---|---|
| AvB | home | 348 | 74 | 67 / 69 | 21 / 19 | 13 / 12 | pass |
| AvB | away | 347 | 75 | 32 / 53 | 34 / 27 | 34 / 20 | fail: win −21 (band 13); loss +14 (band 10) |
| AvC | home | 117 | 43 | 73 / 79 | 22 / 16 | 5 / 5 | pass |
| AvC | away | 117 | 49 | 49 / 39 | 31 / 29 | 21 / 33 | pass |
| AvD | home | 124 | 45 | 84 / 87 | 10 / 11 | 6 / 2 | pass |
| AvD | away | 124 | 125 | 59 / 61 | 30 / 30 | 11 / 10 | pass |
| BvC | home | 2 | 17 | - | - | - | too few simulated games, not judged |
| BvC | away | 153 | 24 | 35 / 21 | 41 / 42 | 25 / 38 | pass |
| BvD | home | 0 | 24 | - | - | - | too few simulated games, not judged |
| BvD | away | 1414 | 155 | 50 / 43 | 28 / 32 | 22 / 26 | pass |
| CvD | home | 0 | 13 | - | - | - | too few simulated games, not judged |
| CvD | away | 1029 | 91 | 33 / 42 | 33 / 23 | 34 / 35 | fail: draw +10 (band 9) |

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
| Liga FUTVE (VE1) | 40 | 8400 | 47.3 | 22.6 | 30.0 | 2.87 |

## Other competitions the game plays with a full match engine

| Competition | Games | Home % | Draw % | Away % | Goals/game |
|---|---|---|---|---|---|
| club-world-cup | 630 | 41.6 | 29.4 | 29.0 | 1.85 |
| cup | 6200 | 39.2 | 29.0 | 31.8 | 2.26 |
| intercontinental-cup | 200 | 62.0 | 14.5 | 23.5 | 2.27 |
| libertadores | 6200 | 49.5 | 27.8 | 22.6 | 2.26 |
| recopa | 80 | 51.2 | 33.8 | 15.0 | 2.16 |
| state | 30840 | 50.3 | 26.0 | 23.7 | 2.42 |
| sul-americana | 6280 | 50.0 | 28.5 | 21.5 | 2.27 |

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
| Each league abroad's own parameters and cards | A league abroad plays at its fitted (or guessed) params in both tiers, and the full tier books its players at its real card rates | `fix/calibration-world` |
| Squad levels by revenue, rebuilt squads and the 2026 position shape | A moved club plays near the middle of its new division; squads keep their real share of forwards | `fix/calibration-drift` |
| Newcomers at the real squads' level | Pre-contracts only for players their AI club lets go, upgrades of 1 to 5 points, AI graduates at their club's level: squads stop widening over ten seasons | `fix/calibration-drift` |
| Extra time at the world cups' goal rate | Ties after 90 minutes play 30 more | `42e73a3c` |
| National football (call-ups, absences, live national matches) | National squads take players from clubs during windows | `0e3ac861` and `30941c8c` |

`calibration.test.ts` and `paramsForLeagueAbroad.test.ts` hold every fitted league to its real rates on day one, and `expectLowerDivisionResultsNearReal` in `runSeasons.test.ts` holds Série B–D to theirs over ten seasons of promotions and relegations.

## Limits

- The real leagues abroad run from 2022/23 to 2025/26; the game starts in 2026 and the squads are those of Transfermarkt in October 2026. A league whose real level moved after 2022 (Eliteserien, MLS) differs from its sample for that reason too.
- The result-only tier plays straight round robins. MLS, Liga MX and Argentina play different formats and play-offs in the real world.
- Cards abroad cannot be compared with a simulation, because the result-only tier draws none. The table shows the real figures next to the rates the full tier uses. The English and Scottish files leave out the first yellow of a player sent off for a second, about 1% of their yellows (football-data.co.uk's notes.txt). Which reds are second yellows is not in the files; the game takes Série A's share.
- Competitions without real data (the continental cups, the Club World Cup, the national cups abroad, 39 of the 62 leagues abroad) appear for completeness. They carry no verdict. The leagues abroad keep Série A's strengthImpact and gapSaturation, as Série B–D do; how far apart their clubs are comes from Transfermarkt's market values alone.
