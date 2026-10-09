# Data sources

Every derived value in `data/` names its source here. In `clubs.csv` each value also has a `*_source` column; `guess` means no real source was found and the value is a placeholder.

## clubs.csv

One row per club: the 156 clubs of Série A–D 2026 plus the 125 clubs that only play their 2026 state championship. Built by `pipeline/build_clubs.py`.

| Column | Source |
|---|---|
| `id` | Short name plus state, e.g. `botafogo-sp`. Stable as long as the short name does not change. |
| `tm_id`, `name` | Transfermarkt club id and squad page title. |
| `short_name` | Derived from the Transfermarkt name by dropping words like "Esporte Clube" at either end. Awkward results are overridden in `club-facts.csv` (`curated`). |
| `division` | Transfermarkt Série A–D 2026 participant pages. Empty means the club only plays its state championship. |
| `state` | The Transfermarkt 2026 state championship (first division) the club plays in. Five A–D clubs play a state second division in 2026; their state comes from `club-facts.csv`. |
| `stadium`, `capacity` | Transfermarkt squad page header. Clubs with no stadium there get `Estádio de <club>` and a capacity guess by division (A 30,000, B 15,000, C 8,000, D 5,000, state-only 3,000), marked `guess`. |
| `pitch` | Artificial for Palmeiras (Allianz Parque), Botafogo (Nilton Santos), Atlético-MG (Arena MRV), Athletico-PR (Ligga Arena) and Chapecoense (Arena Condá), from the Série A 2026 synthetic-pitch reports by [Band](https://www.band.com.br/esportes/quem-jogara-em-gramado-sintetico-no-brasileirao-2026-veja-a-lista-202512111157) and [Itatiaia](https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/brasileirao-serie-a/brasileirao-2026-pode-ter-seis-times-com-gramados-sinteticos-nos-estadios/) (December 2025). The other Série A clubs are natural because they are not on those lists. No 2026 list was found for Série B–D or state clubs, so they are `natural` with source `guess`. |
| `primary_colour`, `secondary_colour` | Transfermarkt "Club colours" (facts page) first. Otherwise the home kit colours (`corpo1`, `calção1`, `corpo2`, `meias1`) from the club's Portuguese Wikipedia infobox, found through Wikidata's Transfermarkt team id (P7223), stored in `wiki-colours.csv` by `pipeline/fetch_wiki_colours.py`. Otherwise `#1F3A93` / `#FFFFFF`, marked `guess`. |
| `crest_url` | `https://api.sofascore.app/api/v1/team/{id}/image` once a `sofascore_id` fact exists for the club. Empty for now: Sofascore answered every request with a Cloudflare challenge on 2026-10-09, and Wikidata's Sofascore team id (P13897) is set for only one of these clubs. |
| `fanbase` | Share of Brazilians who support the club in the [Ipsos-Ipec / O Globo survey](https://www.diariodepernambuco.com.br/esportes-dp/sport/2025/07/7795455-pesquisa-aponta-o-sport-com-a-13-maior-torcida-do-pais-santa-cruz-tambem-ocupa-o-top-20.html) (5–9 June 2025, 2,000 people in 132 towns), times 213,421,037, the IBGE 2025 population estimate. The survey lists 20 clubs, down to Athletico-PR and Remo at 0.5%. Every other club gets a guess by division (A 800,000, B 500,000, C 200,000, D 80,000, state-only 20,000). |

`club-facts.csv` holds hand-checked values that override or fill the scraped ones: one row per club and field, with its source.

## players.csv

`club_id` links each player to `clubs.csv`. Strength starts from a division baseline (A 72, B 63, C 56, D 49). State-only clubs start at 42, one step below Série D (`guess`, keeping the roughly 7-point gap between divisions). They have no Sofascore stats, so their strength moves only with market value and age.

The baselines were checked against Copa do Brasil 2017–2025 matches between divisions (`pnpm calibrate`) and left unchanged. With Série A's strength-to-goals curve, these gaps make cup favourites win far too often (Série A away at Série D or below: 89% simulated, 61% real). Squeezing the baselines to about a third of their gaps would fit the cup, but the cup is a biased witness: big clubs rest players, first-round favourites go through on a draw, and the small clubs that reach later rounds are the best of their division. So the cup gets its own flatter strength curve (`CUP_PARAMS` in `src/engine/paramsForDivision.ts`) and the league gaps stay. No league data compares divisions directly, because every 2026 squad is rated within its own 2026 division.

## Historical results

| File | Source | Rebuilt by |
|---|---|---|
| `history/sofascore/copa-do-brasil.csv` (2024) | Sofascore unique-tournament 373, `/api/v1/unique-tournament/373/season/{id}/events/last/{page}`; odds from `/api/v1/event/{id}/odds/1/all`, market "Full time", closing `fractionalValue` converted to decimal | `pipeline/fetch_history.py` |
| `history/sofascore/brasileirao-serie-b.csv`, `-serie-c.csv`, `-serie-d.csv` (2024) | Sofascore unique-tournaments 390, 1281 and 10326, events endpoint only; no odds | `pipeline/fetch_history.py` |
| `history/sofascore/divisions.csv` (2024) | Sofascore standings of Série A–D (unique-tournaments 325, 390, 1281, 10326), `/api/v1/unique-tournament/{t}/season/{id}/standings/total` | `pipeline/fetch_history.py` |
| `history/espn/copa-do-brasil.csv`, `brasileirao-serie-b.csv`, `brasileirao-serie-c.csv` | ESPN `site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={year}`, leagues `bra.copa_do_brazil`, `bra.2`, `bra.3`; no odds | `pipeline/fetch_espn.py` |
| `history/espn/divisions.csv` | ESPN standings `apis/v2/sports/soccer/{league}/standings?season={year}` for `bra.1`–`bra.3` | `pipeline/fetch_espn.py` |

Notes:

- Sofascore covers only 2024: on 2026-10-09 it put every further request behind a Cloudflare captcha. ESPN fills the other seasons; the loader prefers Sofascore when both have a season.
- ESPN has no Série D and no Série C before 2017.
- Dates are local Brazil dates (America/Sao_Paulo). Scores leave out shootout goals; the shootout winner is a separate column.
- Teams are joined across sources by `team_key` (`pipeline/team_key.py`): lowercase ASCII words without club-type abbreviations. It is approximate; names that differ beyond that do not match.
- The 2026 season was still running when fetched, so it only has the matches finished by then.

## Engine parameters (`src/engine/paramsForDivision.ts`)

| Params | Fitted by `pnpm calibrate` to |
|---|---|
| Série A (`CALIBRATED`) | Série A 2022+ results and closing odds (`brasileirao-serie-a-odds.csv`) |
| Série B, C | Home, draw and away shares and goals per game from 2022 on (Série B includes the finished 2026 games). Strength spread is Série A's, since B and C have no odds. |
| Série D | Same, from the 2024 season only (510 games, so its test tolerance is twice as wide) |
| Copa do Brasil (`CUP_PARAMS`) | Win, draw and loss shares and goals per game of the higher-division club, by division gap and venue, 2017–2025. In ESPN seasons a club with no A–C standing counts as "D or below". Two-leg knockout rates are checked, not fitted. |

## Season calendar and league formats (`src/sim/`)

| Value | Source |
|---|---|
| Date-bases: state championships 11 Jan–8 Mar (11 dates), Série A 28 Jan–2 Dec, B 21 Mar–28 Nov, C 5 Apr–25 Oct, D 5 Apr–13 Sep | [Trivela, CBF 2026 calendar](https://trivela.com.br/brasil/calendario-do-futebol-brasileiro-2026/) |
| Copa do Brasil 2026: phases 1–4 single leg, phase 5 to semi-finals two legs, single-leg final on 6 Dec; phase dates | [Band](https://www.band.com.br/esportes/conheca-o-novo-formato-da-copa-do-brasil-a-partir-de-2026-202510011208), [BNews](https://www.bnewssaopaulo.com.br/amp/noticias/esportes/nova-copa-do-brasil-cbf-divulga-datas-e-mudancas-no-formato-confira.html), [Netflu](https://www.netflu.com.br/veja-o-calendario-fase-por-fase-da-copa-do-brasil-de-2026/). Phase 2, phase 5 and semi-final dates are `guess`. |
| Série A and B: 20 clubs, 38 rounds; A relegates 4, B promotes 4 and relegates 4 | [Band](https://www.band.com.br/nacional/brasil/ponte-preta-e-guarani-entenda-os-regulamentos-das-series-b-e-c-de-2026) |
| Série C 2026: 19-round single round robin, quadrangulars of 1/4/5/8 and 2/3/6/7, top 2 promoted, two-leg final, bottom 2 relegated; 24 clubs and 6 relegated from 2027 | [NSC Total](https://www.nsctotal.com.br/?p=7670657), [Diario de Pernambuco](https://www.diariodepernambuco.com.br/esportes-dp/santa-cruz/2025/10/11698141-santa-cruz-na-disputa-entenda-as-mudancas-no-regulamento-da-serie-c.html). The 24-club format (23-round first phase, same quadrangulars) is a `guess`. |
| Série D 2026: 96 clubs, 16 groups of 6, top 4 to two-leg knockouts, semi-finalists plus two playoff winners among quarter-final losers promoted, last 32 stay in Série D | [CBF](https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-serie-d/a/cbf-publica-documentos-tecnicos-da-nova-serie-d), [Diario de Pernambuco](https://www.diariodepernambuco.com.br/esportes-dp/nacional/2025/10/11697172-com-as-mudancas-da-cbf-entenda-como-vai-ficar-a-serie-d.html). Regional groups (clubs sorted by state, north to south), knockout seeding (best vs worst) and playoffs on semi-final dates are `guess`. |
| Tie-break order: points, wins, goal difference, goals scored, head-to-head (two clubs only), red cards, yellow cards, draw | [Band](https://www.band.com.br/esportes/brasileirao-criterios-desempate), [TecMundo](https://www.tecmundo.com.br/apostas/409831-brasileirao-2026-formato-datas-vagas-para-libertadores-e-sul-americana.htm). Cards are skipped until they are tracked. |
