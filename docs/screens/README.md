# Screens

Every screen and major dialog of the game, in the light and the dark theme, at 1280×800, as WebP (quality 55). They ship in the repository only, not in the app. 66 screens, 132 images.

Regenerate with the docs capture, from `apps/desktop`:

```sh
SHOT_THEME=light pnpm docs:screens && SHOT_THEME=dark pnpm docs:screens   # writes PNGs to /tmp/boleiro-shots
node docs-capture/publish.mjs                                              # converts them into docs/screens
```

The capture plays a game of Flamengo from world seed 53 in the e2e build (`VITE_E2E=1`), reaching each screen with the same helpers the e2e specs use. A coach's name, a squad or a match can differ when the game's data or engine changes.

## Start

| Screen | Light | Dark |
|---|---|---|
| Start menu | <img src="light/01-start-menu.webp" width="380" alt="Start menu, light"> | <img src="dark/01-start-menu.webp" width="380" alt="Start menu, dark"> |
| New game | <img src="light/02-new-game.webp" width="380" alt="New game, light"> | <img src="dark/02-new-game.webp" width="380" alt="New game, dark"> |
| New game, a club picked | <img src="light/03-new-game-club-picked.webp" width="380" alt="New game, a club picked, light"> | <img src="dark/03-new-game-club-picked.webp" width="380" alt="New game, a club picked, dark"> |
| New game, calendar and formats (Personalizar) | <img src="light/04-new-game-formats.webp" width="380" alt="New game, calendar and formats (Personalizar), light"> | <img src="dark/04-new-game-formats.webp" width="380" alt="New game, calendar and formats (Personalizar), dark"> |
| New game, two coaches on one computer | <img src="light/05-new-game-hot-seat.webp" width="380" alt="New game, two coaches on one computer, light"> | <img src="dark/05-new-game-hot-seat.webp" width="380" alt="New game, two coaches on one computer, dark"> |

## Club

| Screen | Light | Dark |
|---|---|---|
| Hub (Times) | <img src="light/10-hub.webp" width="380" alt="Hub (Times), light"> | <img src="dark/10-hub.webp" width="380" alt="Hub (Times), dark"> |
| Hub, the paper open | <img src="light/11-hub-paper.webp" width="380" alt="Hub, the paper open, light"> | <img src="dark/11-hub-paper.webp" width="380" alt="Hub, the paper open, dark"> |
| Finances | <img src="light/30-finances.webp" width="380" alt="Finances, light"> | <img src="dark/30-finances.webp" width="380" alt="Finances, dark"> |
| Stadium | <img src="light/31-stadium.webp" width="380" alt="Stadium, light"> | <img src="dark/31-stadium.webp" width="380" alt="Stadium, dark"> |
| Youth | <img src="light/32-youth.webp" width="380" alt="Youth, light"> | <img src="dark/32-youth.webp" width="380" alt="Youth, dark"> |
| Sponsors | <img src="light/33-sponsors.webp" width="380" alt="Sponsors, light"> | <img src="dark/33-sponsors.webp" width="380" alt="Sponsors, dark"> |
| Chemistry | <img src="light/34-chemistry.webp" width="380" alt="Chemistry, light"> | <img src="dark/34-chemistry.webp" width="380" alt="Chemistry, dark"> |
| Assistant coach | <img src="light/35-assistant.webp" width="380" alt="Assistant coach, light"> | <img src="dark/35-assistant.webp" width="380" alt="Assistant coach, dark"> |
| National team | <img src="light/36-national-team.webp" width="380" alt="National team, light"> | <img src="dark/36-national-team.webp" width="380" alt="National team, dark"> |
| Newspaper | <img src="light/37-newspaper.webp" width="380" alt="Newspaper, light"> | <img src="dark/37-newspaper.webp" width="380" alt="Newspaper, dark"> |
| Calendar | <img src="light/38-calendar.webp" width="380" alt="Calendar, light"> | <img src="dark/38-calendar.webp" width="380" alt="Calendar, dark"> |
| Squad | <img src="light/40-squad.webp" width="380" alt="Squad, light"> | <img src="dark/40-squad.webp" width="380" alt="Squad, dark"> |
| Player | <img src="light/41-player.webp" width="380" alt="Player, light"> | <img src="dark/41-player.webp" width="380" alt="Player, dark"> |

## Market

| Screen | Light | Dark |
|---|---|---|
| Market, search | <img src="light/20-market-search.webp" width="380" alt="Market, search, light"> | <img src="dark/20-market-search.webp" width="380" alt="Market, search, dark"> |
| Market, a player picked to buy | <img src="light/21-market-buy.webp" width="380" alt="Market, a player picked to buy, light"> | <img src="dark/21-market-buy.webp" width="380" alt="Market, a player picked to buy, dark"> |
| Market, players put up for sale | <img src="light/22-market-sell.webp" width="380" alt="Market, players put up for sale, light"> | <img src="dark/22-market-sell.webp" width="380" alt="Market, players put up for sale, dark"> |
| Market, a player at auction | <img src="light/23-market-auction.webp" width="380" alt="Market, a player at auction, light"> | <img src="dark/23-market-auction.webp" width="380" alt="Market, a player at auction, dark"> |

## Tables

| Screen | Light | Dark |
|---|---|---|
| Tables, state championship | <img src="light/50-tables-state.webp" width="380" alt="Tables, state championship, light"> | <img src="dark/50-tables-state.webp" width="380" alt="Tables, state championship, dark"> |
| Tables, Série A | <img src="light/51-tables-serie-a.webp" width="380" alt="Tables, Série A, light"> | <img src="dark/51-tables-serie-a.webp" width="380" alt="Tables, Série A, dark"> |
| Tables, Copa do Brasil bracket | <img src="light/52-tables-cup-bracket.webp" width="380" alt="Tables, Copa do Brasil bracket, light"> | <img src="dark/52-tables-cup-bracket.webp" width="380" alt="Tables, Copa do Brasil bracket, dark"> |
| Tables, Libertadores | <img src="light/53-tables-libertadores.webp" width="380" alt="Tables, Libertadores, light"> | <img src="dark/53-tables-libertadores.webp" width="380" alt="Tables, Libertadores, dark"> |
| Tables, world cups | <img src="light/54-tables-mundial.webp" width="380" alt="Tables, world cups, light"> | <img src="dark/54-tables-mundial.webp" width="380" alt="Tables, world cups, dark"> |
| Tables, other leagues | <img src="light/55-tables-others.webp" width="380" alt="Tables, other leagues, light"> | <img src="dark/55-tables-others.webp" width="380" alt="Tables, other leagues, dark"> |

## Coaches

| Screen | Light | Dark |
|---|---|---|
| Coaches | <img src="light/60-coaches.webp" width="380" alt="Coaches, light"> | <img src="dark/60-coaches.webp" width="380" alt="Coaches, dark"> |
| Coaches, CBF ranking | <img src="light/61-coaches-cbf.webp" width="380" alt="Coaches, CBF ranking, light"> | <img src="dark/61-coaches-cbf.webp" width="380" alt="Coaches, CBF ranking, dark"> |
| Coaches, world ranking | <img src="light/62-coaches-world.webp" width="380" alt="Coaches, world ranking, light"> | <img src="dark/62-coaches-world.webp" width="380" alt="Coaches, world ranking, dark"> |
| Coaches, places in cups | <img src="light/63-coaches-places.webp" width="380" alt="Coaches, places in cups, light"> | <img src="dark/63-coaches-places.webp" width="380" alt="Coaches, places in cups, dark"> |

## Options and saves

| Screen | Light | Dark |
|---|---|---|
| Options | <img src="light/70-options.webp" width="380" alt="Options, light"> | <img src="dark/70-options.webp" width="380" alt="Options, dark"> |
| Options, credits | <img src="light/71-options-credits.webp" width="380" alt="Options, credits, light"> | <img src="dark/71-options-credits.webp" width="380" alt="Options, credits, dark"> |
| Saves | <img src="light/72-saves.webp" width="380" alt="Saves, light"> | <img src="dark/72-saves.webp" width="380" alt="Saves, dark"> |
| Start menu with a saved game | <img src="light/140-start-menu-with-save.webp" width="380" alt="Start menu with a saved game, light"> | <img src="dark/140-start-menu-with-save.webp" width="380" alt="Start menu with a saved game, dark"> |
| Saved games | <img src="light/141-saved-games.webp" width="380" alt="Saved games, light"> | <img src="dark/141-saved-games.webp" width="380" alt="Saved games, dark"> |

## Match day

| Screen | Light | Dark |
|---|---|---|
| Lineup | <img src="light/80-lineup.webp" width="380" alt="Lineup, light"> | <img src="dark/80-lineup.webp" width="380" alt="Lineup, dark"> |
| Tactics | <img src="light/81-tactics.webp" width="380" alt="Tactics, light"> | <img src="dark/81-tactics.webp" width="380" alt="Tactics, dark"> |
| Match plan | <img src="light/82-match-plan.webp" width="380" alt="Match plan, light"> | <img src="dark/82-match-plan.webp" width="380" alt="Match plan, dark"> |
| Live round on the board | <img src="light/90-live-round.webp" width="380" alt="Live round on the board, light"> | <img src="dark/90-live-round.webp" width="380" alt="Live round on the board, dark"> |
| Match panel over the live round | <img src="light/92-match-panel.webp" width="380" alt="Match panel over the live round, light"> | <img src="dark/92-match-panel.webp" width="380" alt="Match panel over the live round, dark"> |
| Match page, summary | <img src="light/93-match-page-summary.webp" width="380" alt="Match page, summary, light"> | <img src="dark/93-match-page-summary.webp" width="380" alt="Match page, summary, dark"> |
| Match page, lineups | <img src="light/94-match-page-lineups.webp" width="380" alt="Match page, lineups, light"> | <img src="dark/94-match-page-lineups.webp" width="380" alt="Match page, lineups, dark"> |
| Match page, stats | <img src="light/95-match-page-stats.webp" width="380" alt="Match page, stats, light"> | <img src="dark/95-match-page-stats.webp" width="380" alt="Match page, stats, dark"> |
| Match page, head to head | <img src="light/96-match-page-head-to-head.webp" width="380" alt="Match page, head to head, light"> | <img src="dark/96-match-page-head-to-head.webp" width="380" alt="Match page, head to head, dark"> |
| Live round at full time | <img src="light/97-live-round-end.webp" width="380" alt="Live round at full time, light"> | <img src="dark/97-live-round-end.webp" width="380" alt="Live round at full time, dark"> |

## Events

| Screen | Light | Dark |
|---|---|---|
| A club event waiting in the hub | <img src="light/100-hub-event.webp" width="380" alt="A club event waiting in the hub, light"> | <img src="dark/100-hub-event.webp" width="380" alt="A club event waiting in the hub, dark"> |
| Press conference | <img src="light/101-press-conference.webp" width="380" alt="Press conference, light"> | <img src="dark/101-press-conference.webp" width="380" alt="Press conference, dark"> |

## Moments

| Screen | Light | Dark |
|---|---|---|
| Career moment, a title | <img src="light/110-moment-title.webp" width="380" alt="Career moment, a title, light"> | <img src="dark/110-moment-title.webp" width="380" alt="Career moment, a title, dark"> |
| Career moment, a sacking | <img src="light/111-moment-sacked.webp" width="380" alt="Career moment, a sacking, light"> | <img src="dark/111-moment-sacked.webp" width="380" alt="Career moment, a sacking, dark"> |
| Career moment, the morning after | <img src="light/112-moment-sacked-end.webp" width="380" alt="Career moment, the morning after, light"> | <img src="dark/112-moment-sacked-end.webp" width="380" alt="Career moment, the morning after, dark"> |
| Job offers | <img src="light/113-offers.webp" width="380" alt="Job offers, light"> | <img src="dark/113-offers.webp" width="380" alt="Job offers, dark"> |

## Season end

| Screen | Light | Dark |
|---|---|---|
| End of the season | <img src="light/120-season-end.webp" width="380" alt="End of the season, light"> | <img src="dark/120-season-end.webp" width="380" alt="End of the season, dark"> |
| Trajectory | <img src="light/121-trajectory.webp" width="380" alt="Trajectory, light"> | <img src="dark/121-trajectory.webp" width="380" alt="Trajectory, dark"> |
| Awards | <img src="light/122-awards.webp" width="380" alt="Awards, light"> | <img src="dark/122-awards.webp" width="380" alt="Awards, dark"> |

## History and album

| Screen | Light | Dark |
|---|---|---|
| History, club | <img src="light/123-history-club.webp" width="380" alt="History, club, light"> | <img src="dark/123-history-club.webp" width="380" alt="History, club, dark"> |
| Album, a season's page | <img src="light/124-album-season-page.webp" width="380" alt="Album, a season's page, light"> | <img src="dark/124-album-season-page.webp" width="380" alt="Album, a season's page, dark"> |
| History, trophies | <img src="light/125-history-trophies.webp" width="380" alt="History, trophies, light"> | <img src="dark/125-history-trophies.webp" width="380" alt="History, trophies, dark"> |
| History, records | <img src="light/126-history-records.webp" width="380" alt="History, records, light"> | <img src="dark/126-history-records.webp" width="380" alt="History, records, dark"> |
| History, champions | <img src="light/127-history-champions.webp" width="380" alt="History, champions, light"> | <img src="dark/127-history-champions.webp" width="380" alt="History, champions, dark"> |
| History, top scorers | <img src="light/128-history-scorers.webp" width="380" alt="History, top scorers, light"> | <img src="dark/128-history-scorers.webp" width="380" alt="History, top scorers, dark"> |
| History, career | <img src="light/129-history-career.webp" width="380" alt="History, career, light"> | <img src="dark/129-history-career.webp" width="380" alt="History, career, dark"> |
| History, rarities | <img src="light/130-history-rarities.webp" width="380" alt="History, rarities, light"> | <img src="dark/130-history-rarities.webp" width="380" alt="History, rarities, dark"> |

## Hot seat

| Screen | Light | Dark |
|---|---|---|
| Hot-seat hub | <img src="light/150-hot-seat-hub.webp" width="380" alt="Hot-seat hub, light"> | <img src="dark/150-hot-seat-hub.webp" width="380" alt="Hot-seat hub, dark"> |
| Hot-seat turn screen | <img src="light/151-hot-seat-turn.webp" width="380" alt="Hot-seat turn screen, light"> | <img src="dark/151-hot-seat-turn.webp" width="380" alt="Hot-seat turn screen, dark"> |
