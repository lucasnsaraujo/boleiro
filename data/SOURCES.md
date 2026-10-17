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
| `fanbase` | Share of Brazilians who support the club in the [Ipsos-Ipec / O Globo survey](https://www.diariodepernambuco.com.br/esportes-dp/sport/2025/07/7795455-pesquisa-aponta-o-sport-com-a-13-maior-torcida-do-pais-santa-cruz-tambem-ocupa-o-top-20.html) (5–9 June 2025, 2,000 people in 132 towns), times 213,421,037, the IBGE 2025 population estimate. The survey lists 20 clubs, down to Athletico-PR and Remo at 0.5%. Every other club gets a guess by division (A 800,000, B 500,000, C 200,000, D 80,000, state-only 20,000). |

`club-facts.csv` holds hand-checked values that override or fill the scraped ones: one row per club and field, with its source.

## crests.csv and assets/crests/

One row per club, built by `pipeline/fetch_crests.py`. The images ship inside the app so they work offline. They are not licensed: Boleiro is a personal game that is never sold.

| Column | Source |
|---|---|
| `crest` | Transfermarkt crest, `https://tmssl.akamaized.net/images/wappen/head/{tm_id}.png` (139×181 PNG, transparent), saved as `assets/crests/{tm_id}.png`. All 281 clubs had one on 2026-10-10. |
| `scoreboard_crest` | ESPN's 500×500 logo for the big scoreboard, saved as `assets/crests/scoreboard/{tm_id}.png`. Only for clubs that match an ESPN team with certainty: ESPN teams come from `site.api.espn.com/apis/site/v2/sports/soccer/{bra.1,bra.2,bra.copa_do_brazil}/teams`, and a match needs the same `team_key` name and the same division (`bra.1` is Série A, `bra.2` is Série B), with one candidate on each side, or a row in `espn-crest-matches.csv`. Cup-only ESPN teams have no division, so Série C, D and state-only clubs get none. Empty means no certain match. |

`espn-crest-matches.csv` holds hand-checked ESPN matches the name rule misses, each with how it was checked.

All files are recompressed losslessly with `oxipng`, which keeps the folder at about 8.5 MB.

## assets/competitions/

The logos of FIFA's two club cups, which the app shows on their tables. Like the crests, they ship inside the app and are not licensed.

| File | Source |
|---|---|
| `intercontinental-cup.webp` | The FIFA Intercontinental Cup logo, [File:FIFA_Intercontinental_Cup_logo.svg](https://en.wikipedia.org/wiki/File:FIFA_Intercontinental_Cup_logo.svg) on the English Wikipedia, its 500 px render fetched on 2026-10-16. The game calls the cup Mundial de Clubes. |
| `club-world-cup.webp` | The FIFA Club World Cup 2025 logo, [File:2025_FIFA_Club_World_Cup.svg](https://commons.wikimedia.org/wiki/File:2025_FIFA_Club_World_Cup.svg) on Wikimedia Commons (credited to FIFA), its 500 px render fetched on 2026-10-16. The game calls the cup Super Mundial. |

Both were scaled to 160 px wide and saved as WebP with `cwebp -q 90`.

## players.csv

`club_id` links each player to `clubs.csv`. Strength starts from a division baseline (A 72, B 63, C 56, D 49). State-only clubs start at 42, one step below Série D (`guess`, keeping the roughly 7-point gap between divisions). They have no Sofascore stats, so their strength moves only with market value and age.

The baselines were checked against Copa do Brasil 2017–2025 matches between divisions (`pnpm calibrate`) and left unchanged. With Série A's strength-to-goals curve, these gaps make cup favourites win far too often (Série A away at Série D or below: 89% simulated, 61% real). Squeezing the baselines to about a third of their gaps would fit the cup, but the cup is a biased witness: big clubs rest players, first-round favourites go through on a draw, and the small clubs that reach later rounds are the best of their division. So the cup gets its own flatter strength curve (`CUP_PARAMS` in `packages/engine/src/engine/paramsForDivision.ts`) and the league gaps stay. No league data compares divisions directly, because every 2026 squad is rated within its own 2026 division.

How the game uses `age` and `nationality` (`packages/engine/src/sim/players/`): each season a player's strength follows the 2026 squads' mean strength by age within a division (about 4 below the division level at 17, 1 above from 27 to 31, 4 below at 38), and players leave at the rate each age group shrinks in this file (about 6% a year from 29, rising to 70% past 40). Players whose nationalities don't include Brazil count as foreign. Injury, fatigue and travel rates name their studies in the code; every other rate there is marked `guess`.

## fotmob-players.csv and fotmob-lineups.csv

From FotMob's public JSON (`/api/data/leagues`, `/api/data/teams`, `/api/data/matchDetails`) on 2026-10-14, by `pipeline/scrape_fotmob.py`: 185 of the game's 281 clubs: all 156 of Séries A–D (8 Série D clubs have no squad on FotMob, only their last eleven) and 29 state-only clubs from the state championships FotMob covers.

- `fotmob-players.csv`: each player's positions as FotMob lists them, main first (`CB,LB`). `tm_id` is the Transfermarkt player of the same club with the same name, or the only one whose name holds the other's words (age within a year); empty where none or several fit. The game keeps Transfermarkt's position as the main one and adds FotMob's other roles (`pipeline/positions.py`).
- `fotmob-lineups.csv`: each club's eleven in its last match. Séries A and B team pages give the formation and each starter's slot; for Séries C and D the last match's details list the starters only, so `formation` is empty and the game picks the formation those starters fit best. A club missing here plays the formation its squad fits best (`guess`).
- Costs of playing out of position (`packages/engine/src/engine/formations.ts`, `match.ts`): 97% of a player's strength in one of his other positions (`guess`, the approved lineup mock's −3%), 85% anywhere else and 50% for a keeper outfield or an outfielder in goal (`guess`, the values the engine already used). Checked with `pnpm calibrate` on the elevens the game fields.

## coaches.csv and packages/data/src/coachRoster.ts

Each club's head coach from Transfermarkt's league manager lists (`https://www.transfermarkt.com/x/trainer/pokalwettbewerb/<league code>`, e.g. [Série A](https://www.transfermarkt.com/x/trainer/pokalwettbewerb/BRA1)) on 2026-10-17, by `pipeline/fetch_coaches.py`: one page per league of the world packs, Séries A–D included, 66 pages, 1,163 clubs. Each row keeps the coach's Transfermarkt id, name, nationality (his first flag), age, the day he took over (dated back from the page's time in charge), contract end and whether Transfermarkt has a playing career for him. A page that lists a club twice (the coach on his way out and the one just installed) keeps the latest appointment. Venezuela's page matched none of the pack's clubs.

Clubs without a row (Venezuela's, state-only clubs, the Club World Cup's guests) get invented coaches with local names (`packages/engine/src/sim/coach/inventCoachName.ts`); no real person is meant, a draw that lands on a name in this roster is drawn again, and the coaches screen tags them "fictício". The lists hold only coaches in a job, so real coaches out of work on that day (Fernando Diniz, say) aren't in the data: the free pool on day one is invented, plus the real coach of each club a human takes.

## derbies.csv and packages/data/src/derbies.ts

Every derby between two of the game's clubs, from English Wikipedia's rivalry lists on 2026-10-17, by `pipeline/fetch_derbies.py`: the four continental lists ([Europe](https://en.wikipedia.org/wiki/List_of_association_football_club_rivalries_in_Europe), [the Americas](https://en.wikipedia.org/wiki/List_of_association_football_club_rivalries_in_the_Americas), [Africa](https://en.wikipedia.org/wiki/List_of_association_football_club_rivalries_in_Africa), [Asia and Oceania](https://en.wikipedia.org/wiki/List_of_association_football_club_rivalries_in_Asia_and_Oceania)) and the 20 country lists they point to with `{{Main}}` ([Brazil's](https://en.wikipedia.org/wiki/List_of_Brazilian_football_derbies) among them). Each row keeps the list page it came from (`source`). A line that links two to four of the game's clubs, before its prose starts, is a derby between each pair. Clubs are matched by their English article, which Wikidata gives for each Transfermarkt club id (property P7223; 1,055 of 1,344 clubs); 16 more Brazilian clubs are matched by short name inside their state's section of Brazil's list (a link after the line's head, which names the city). In a state's section, a link to another state's namesake (Santarém's derby links Manaus's São Raimundo) stands for the section's own club. Brazil's list has 113 derby lines; 68 are between two clubs the game has. 551 pairs in all.

Names: a line's own name for its derby, without the English translation in brackets, and of `X derby or Ca–Ju` the local one; English names (`London derby`, `The Topper`, `Derby of Via Emilia`), city headings (`Córdoba`), place pairs and table markup are left out, and the game calls those derbies "Clássico". 169 pairs have a name.

Intensity, 1 to 5:
- 81 pairs rated by hand (`basis` hand), each citing the derby's article, or the list that has it when it has none: 5 for the derbies that stop a country (Fla-Flu, Gre-Nal, Dérbi Paulista, Clássico Mineiro, Ba-Vi, Clássico dos Milhões, Superclásico, Uruguay's Clásico, El Clásico, the Old Firm, Derby della Madonnina, Liverpool–Manchester United, the Intercontinental Derby, Olympiacos–Panathinaikos), 4 for a big city's or state's main derby, 3 for a smaller state's main derby or a big city's next ones (Clássico das Emoções, Ca-Ju, ABC × América, Sampaio × Moto, Campinense × Treze, Atlético-GO × Goiás; Arsenal × Chelsea, Chelsea × Tottenham). The ratings are `guess`.
- The rest by Wikipedia attention over the 60 days to 2026-10-16 (Wikimedia pageviews through the Action API's `prop=pageviews`; the REST pageviews API answered this generic User-Agent once every ~17 s): the derby article's views when the line links one about that derby alone (not a list such as `London derbies` nor an article several pairs share such as `West London derby`), else the smaller club's article views times the median derby-to-club ratio (0.032 over 150 pairs with both). Ranked among their own country's derbies, the hand-rated ones included, 35% of a country's pairs get 1, 35% 2, 20% 3 and 10% 4 (`guess`); the pairs from two countries (the cross-border rivalries in Europe's list) are ranked apart and get at most 2 (`guess`).

Rivalry rules that read it (`packages/engine/src/sim/rivalries/`), all `guess`: a coach is a club's idol at 5 points (1 a year in charge, 1.5 a title, 0.25 a derby won); from intensity 3 an idol coach gets no offer or job from the rival, which won't sell him players (a release clause or a pre-contract still works, the club has no say), and the rival's crowd boos him; a player who is his club's idol (150 games or 40 goals, as the history counts idols) won't join its rival from intensity 3, by any route: the coach's requests, offers for the coach's players and AI clubs' deals. Coaches' rivalries: 1 point a meeting, 3 a final, 2 a press provocation; from 6 points the papers call their meetings a reencontro, and four wins without a defeat make a freguesia.

## Historical results

| File | Source | Rebuilt by |
|---|---|---|
| `history/sofascore/copa-do-brasil.csv` (2024) | Sofascore unique-tournament 373, `/api/v1/unique-tournament/373/season/{id}/events/last/{page}`; odds from `/api/v1/event/{id}/odds/1/all`, market "Full time", closing `fractionalValue` converted to decimal | `pipeline/fetch_history.py` |
| `history/sofascore/brasileirao-serie-b.csv`, `-serie-c.csv`, `-serie-d.csv` (2024) | Sofascore unique-tournaments 390, 1281 and 10326, events endpoint only; no odds | `pipeline/fetch_history.py` |
| `history/sofascore/divisions.csv` (2024) | Sofascore standings of Série A–D (unique-tournaments 325, 390, 1281, 10326), `/api/v1/unique-tournament/{t}/season/{id}/standings/total` | `pipeline/fetch_history.py` |
| `history/espn/copa-do-brasil.csv`, `brasileirao-serie-b.csv`, `brasileirao-serie-c.csv` | ESPN `site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={year}`, leagues `bra.copa_do_brazil`, `bra.2`, `bra.3`; no odds | `pipeline/fetch_espn.py` |
| `history/espn/divisions.csv` | ESPN standings `apis/v2/sports/soccer/{league}/standings?season={year}` for `bra.1`–`bra.3` | `pipeline/fetch_espn.py` |
| `history/espn/cards.csv` (2024–2025) | ESPN match summaries `site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={id}`, `keyEvents` "Yellow Card" and "Red Card" with their minute, for `bra.1`, `bra.2` and `bra.copa_do_brazil`. ESPN lists no cards for Série C and has no Série D. | `pipeline/fetch_espn_cards.py` |

Notes:

- Sofascore covers only 2024: on 2026-10-09 it put every further request behind a Cloudflare captcha. ESPN fills the other seasons; the loader prefers Sofascore when both have a season.
- ESPN has no Série D and no Série C before 2017.
- Dates are local Brazil dates (America/Sao_Paulo). Scores leave out shootout goals; the shootout winner is a separate column.
- Teams are joined across sources by `team_key` (`pipeline/team_key.py`): lowercase ASCII words without club-type abbreviations. It is approximate; names that differ beyond that do not match.
- The 2026 season was still running when fetched, so it only has the matches finished by then.

## Engine parameters (`packages/engine/src/engine/paramsForDivision.ts`)

| Params | Fitted by `pnpm calibrate` to |
|---|---|
| Série A (`CALIBRATED`) | Série A 2022+ results and closing odds (`brasileirao-serie-a-odds.csv`) |
| Série B, C | Home, draw and away shares and goals per game from 2022 on (Série B includes the finished 2026 games). Strength spread is Série A's, since B and C have no odds. |
| Série D | Same, from the 2024 season only (510 games, so its test tolerance is twice as wide) |
| Copa do Brasil (`CUP_PARAMS`) | Win, draw and loss shares and goals per game of the higher-division club, by division gap and venue, 2017–2025. In ESPN seasons a club with no A–C standing counts as "D or below". Two-leg knockout rates are checked, not fitted. |

## Season calendar and league formats (`packages/engine/src/sim/`)

| Value | Source |
|---|---|
| Date-bases: state championships 11 Jan–8 Mar (11 dates), Série A 28 Jan–2 Dec, B 21 Mar–28 Nov, C 5 Apr–25 Oct, D 5 Apr–13 Sep | [Trivela, CBF 2026 calendar](https://trivela.com.br/brasil/calendario-do-futebol-brasileiro-2026/) |
| Copa do Brasil 2026: phases 1–4 single leg, phase 5 to semi-finals two legs, single-leg final on 6 Dec; phase dates | [Band](https://www.band.com.br/esportes/conheca-o-novo-formato-da-copa-do-brasil-a-partir-de-2026-202510011208), [BNews](https://www.bnewssaopaulo.com.br/amp/noticias/esportes/nova-copa-do-brasil-cbf-divulga-datas-e-mudancas-no-formato-confira.html), [Netflu](https://www.netflu.com.br/veja-o-calendario-fase-por-fase-da-copa-do-brasil-de-2026/). Phase 2, phase 5 and semi-final dates are `guess`. |
| Série A and B: 20 clubs, 38 rounds; A relegates 4, B promotes 4 and relegates 4 | [Band](https://www.band.com.br/nacional/brasil/ponte-preta-e-guarani-entenda-os-regulamentos-das-series-b-e-c-de-2026) |
| Série C 2026: 19-round single round robin, quadrangulars of 1/4/5/8 and 2/3/6/7, top 2 promoted, two-leg final, bottom 2 relegated; 24 clubs and 6 relegated from 2027 | [NSC Total](https://www.nsctotal.com.br/?p=7670657), [Diario de Pernambuco](https://www.diariodepernambuco.com.br/esportes-dp/santa-cruz/2025/10/11698141-santa-cruz-na-disputa-entenda-as-mudancas-no-regulamento-da-serie-c.html). The 24-club format (23-round first phase, same quadrangulars) is a `guess`. |
| Série D 2026: 96 clubs, 16 groups of 6, top 4 to two-leg knockouts, semi-finalists plus two playoff winners among quarter-final losers promoted, last 32 stay in Série D | [CBF](https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-serie-d/a/cbf-publica-documentos-tecnicos-da-nova-serie-d), [Diario de Pernambuco](https://www.diariodepernambuco.com.br/esportes-dp/nacional/2025/10/11697172-com-as-mudancas-da-cbf-entenda-como-vai-ficar-a-serie-d.html). Regional groups (clubs sorted by state, north to south), knockout seeding (best vs worst) and playoffs on semi-final dates are `guess`. |
| Copa do Brasil 2026 field: 126 clubs; 28 lowest-ranked in phase 1, 74 in phase 2, Série C, Série D, Copa do Nordeste and Copa Verde champions in phase 3, Série A's 20 in phase 5; level ties go to penalties, no away goals | [Super Rádio Tupi](https://www.tupi.fm/esportes/nova-era-copa-do-brasil-muda-formato-e-bate-recorde-em-2026/), [Lance](https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html), [O Imparcial](https://oimparcial.com.br/noticias/2026/02/copa-do-brasil-comeca-com-126-clubes-e-155-jogos-na-maior-edicao-da-historia/). The ranking (division, then fanbase), potted draws up to phase 5, lower-ranked hosts in single matches, a final hosted by one finalist (drawn) rather than at a neutral ground, and Série B's best two unpromoted clubs in place of the Nordeste and Verde champions are `guess`. |
| Copa do Brasil places per state: SP and RJ 6; MG, RS, PR 5; CE, PE, AL, MT, AM, GO, SC, BA, PA 4; others 3 | [Lance](https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html). Places go to the best-placed estadual clubs outside Série A. |
| Série D places from estaduais: two or three per state plus 14 national places by ranking | [Banda B](https://www.bandab.com.br/esporte/futebol/vagas-na-copa-do-brasil-serie-d-o-que-esta-em-jogo-mata-mata-paranaense/amp/), [Bahia Notícias](https://www.bahianoticias.com.br/esportes/noticia/79538-mudanca-na-serie-d-gera-duvida-sobre-vagas-do-baianao-2027-entenda-cenario). Simplified: two per state, leftovers one at a time to each state's next finisher in Copa-places order, so clubs outside the national leagues return only through their estadual. |
| State championships: one format for all 27 states, groups of up to six (one round each), top 8 (states with 12+ clubs) or top 4 to two-leg knockouts | Spec #2 settles one standard format; group size, qualifiers and legs are `guess`. State games use `CUP_PARAMS` (`guess`: mixed divisions, rested players). The first season seeds estaduais and the Copa from the ranking stand-in (`guess`). |
| Tie-break order: points, wins, goal difference, goals scored, head-to-head (two clubs only), red cards, yellow cards, draw | [Band](https://www.band.com.br/esportes/brasileirao-criterios-desempate), [TecMundo](https://www.tecmundo.com.br/apostas/409831-brasileirao-2026-formato-datas-vagas-para-libertadores-e-sul-americana.htm). Every competition uses this order. |

## Morale and organised supporters (`packages/engine/src/sim/morale/`)

| Value | Source |
|---|---|
| Disorder at a home game (CBJD art. 213): a fine of R$100–100,000, or for serious cases one to ten home games lost, not both | [ABC do ABC](https://abcdoabc.com.br/santos-pode-ser-punido-com-10-jogos/) quoting the article, [Migalhas](https://www.migalhas.com.br/depeso/101156/a-cronica-de-uma-violencia-anunciada---iv) on the one-or-the-other rule. The game plays those home games behind closed doors (no ticket money). How often disorder happens, the share that costs home games and the one-to-three-game range are `guess`. |
| Closed doors halve home advantage | Home sides' goal edge fell from 0.29 to 0.15 a game without fans ([McCarrick et al. 2021](https://northumbria.ac.uk/about-us/news-events/news/football-without-the-fans-new-study-reveals-effect-of-empty-stadiums-during-pandemic), Psychology of Sport and Exercise 56:101969). A larger 10-season study found a smaller, non-significant drop, so this may overstate it. |
| Rivals | Real derbies, `derbies.csv` (below). A derby's crowd grows 5% per level of intensity and its result weighs 1 + 0.25 × intensity for the fans; a rival's result elsewhere moves fan mood in proportion to intensity / 4, from intensity 2, and a day's rival results together by no more than 1.25 points, one intensity-5 rival's (`guess`). A lost derby may end in crowd trouble the STJD punishes only from intensity 3 and between two Brazilian clubs (`guess`). |

Mood swings, escalation thresholds, the strength effect of morale (at most one point either way) and the crowd effect of fan mood (at most 10%) are all `guess`, marked in the code.

## Transfer market (`packages/engine/src/sim/transfers/`)

| Value | Source |
|---|---|
| Windows: 5 Jan–3 Mar and 20 Jul–11 Sep, the same days every season; the restricted March window is left out | CBF 2026 registration windows via [Band](https://www.band.com.br/esportes/janela-internacional-de-transferencias-abre-hoje-veja-detalhes-202607191440) and [Itatiaia](https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/veja-todas-as-datas-do-novo-calendario-do-futebol-brasileiro-em-2026/). AI clubs trading once a week inside a window is `guess`. |
| Pre-contracts only in the last six months of a contract; the player leaves for free when it ends | FIFA Regulations on the Status and Transfer of Players, art. 18(3); Lei 14.597/2023 (Lei Geral do Esporte) ends the sporting bond when the contract ends. |
| Valuation: €1.26M at strength 70, ×1.20 per strength point; ×1.07 a year younger than 27, ×0.947 a year older | Least squares of log Transfermarkt value in `players.csv` (1,170 players with value and age). Division discount and contract-length factor are `guess`. |
| EUR/BRL opens at 6.31 and moves about 2.5% a month | 2025 average and monthly range of the BCB PTAX (series 21619), via [numerando.com.br](https://www.numerando.com.br/cambio/euro/2025). The pull back to 6.31 is `guess`. |
| Agent commission: 3% of the player's pay over the contract | FIFA Football Agent Regulations (2023), art. 15 cap for the player's side. |
| Opening contracts (one to four years in A/B, one or two below), willingness weights, Europe bid chances, AI renewal rule, signings from abroad, loan wage split (50%), signing bonuses | `guess`, each marked next to its constant. |

## Finances

All money is in BRL (whole reais) unless a column says USD. `basis` is `published` (from the club's accounts or an official table), `estimate` (derived from press reports) or `guess` (no source found). Fetched 2026-10-09.

### finances.csv

One row per Série A 2026 club (`club_id` links to `clubs.csv`), plus `small` / `median` / `large` rows for Série B, C and D (`club_id` empty, `size` set). Each row has its own `source`; `guessed_fields` lists the columns that are guesses inside an otherwise sourced row.

| Column | Source |
|---|---|
| Série A, 16 clubs | [EY, Levantamento Financeiro dos Clubes 2025](https://www.ey.com/content/dam/ey-unified-site/ey-com/pt-br/insights/media-entertainment/documents/ey-brasil-relatorio-financeiro-clubes-2025.pdf) (2025 accounts). `broadcasting` is EY's "Direitos de Transmissão e Premiação", so it includes prize money. `sponsorship` is "Receitas Comerciais". `wage_bill` is EY's men's professional payroll share of revenue times revenue. `net_debt` is "Endividamento Líquido"; Corinthians and Grêmio leave out their arena debt. Bahia's net debt is from [Seu Dinheiro](https://www.seudinheiro.com/2026/empresas/quem-sao-os-clubes-mais-quebrados-e-os-com-maior-receita-do-brasil-em-2025-rnda/). |
| `membership` | Not split out by EY: a guess for every club except Athletico-PR and Coritiba. Where EY's matchday line already held membership (the lines added up to more than the total), matchday and membership were shrunk in proportion to fit the total, and `matchday` is marked as a guess too. |
| Athletico-PR, Coritiba | 2025 accounts as reported by Banda B and Economic News Brasil, cross-checked with the [Um Dois Esportes revenue ranking](https://www.umdoisesportes.com.br/futebol-brasileiro/ranking-receitas-futebol-brasileiro-posicoes-athletico-coritiba/). Matchday and net debt are guesses; Athletico's sponsorship and wages too. `estimate`. |
| Remo | 2025 accounts as reported by O Liberal and Diário do Pará: revenue R$82.9M and tickets R$28.2M. Everything else is a guess. `estimate`. |
| Chapecoense | `guess`. The only figure found is R$42.5M in the Um Dois Esportes ranking, the same number it gives Remo, so it is suspect. |
| Série B–D rows | `estimate`. TV money from `competition-money.json`. Payrolls from press reports: Série B about R$2.5M a month for a small club (Athletic-MG, Itatiaia) to R$3–3.5M for a large one (Ceará, Sport's 2026 cap); Série C R$1.0–2.5M a month (Retrô, Santa Cruz, Náutico); Série D R$100–400k a month, with the [Joinville 2026 budget](https://jec.com.br/wp-content/uploads/2025/12/20261231-Orcamento_Jec_Campo.pdf-26.pdf) as the large-club reference. Revenue totals and the other lines are scaled from those, listed in `guessed_fields`. |

Remo and Chapecoense played Série B in 2025, so their revenue is below the rest of Série A; Flamengo's passed R$2B. The game pays them 2026 Série A TV money, so they start above their 2025 accounts.

How the game uses these files (`packages/engine/src/sim/finances/openingFinances.ts`): each club's wage bill comes from its row (Série A) or from the small/median/large rows by squad strength rank in its division (Série B–D); state-only clubs are half a small Série D club (guess). TV money and crowds come from `competition-money.json`, not from the `broadcasting` and `matchday` columns. Sponsorship and membership come from the row. Gate money counts every opening home fixture (league, estadual group and Copa phase 1). Whatever the row's revenue without player sales holds beyond those lines, less the Copa do Brasil prizes the club can expect (`expectedPrizes`, `packages/engine/src/sim/finances/expectedCopaPrize.ts`: each tie a coin flip, a guess), becomes `otherIncome`, which stands for state championship, continental and other money the game does not simulate. Real Copa prizes are paid as they are won (`packages/engine/src/sim/finances/payCopaPrizes.ts`), so they count once. Each new season puts last season's expected prizes back into `otherIncome` and takes the new season's out. Every rate in `packages/engine/src/sim/finances/` names its source or is marked `guess` in the code.

### competition-money.json

| Key | Source |
|---|---|
| `tv.A` | Libra pool about R$1.17B a year, split 40% equal / 30% performance / 30% audience ([Itatiaia](https://www.itatiaia.com.br/esportes/tv-e-streaming/como-sera-a-divisao-de-cotas-no-acordo-bilionario-entre-libra-e-globo/)). LFU pool about R$1.7B, split 45/30/25 ([Máquina do Esporte](https://maquinadoesporte.com.br/?p=216530)). `shares` is the pool-weighted average of the two. `perClubMin` and `perClubMax` are guesses: per-club amounts are not published. |
| `tv.B` | R$14.9M per club in 2026 ([Band](https://www.band.com.br/esportes/serie-b-2026-veja-quanto-cada-clube-vai-receber-de-cota-de-tv-202603201612), read from a search summary). CBF also pays travel and referees, not included. |
| `tv.C` | R$1.55M per club in 2025 (Diário de Pernambuco); 2026 assumed unchanged. |
| `tv.D` | R$500k per club in 2026 from CBF ([Band](https://www.band.com.br/esportes/cbf-divulga-cotas-financeiras-da-serie-d-de-2026-veja-valores-202603052047)). Later phases add R$100–300k each, not included. |
| `copaDoBrasil` | CBF 2026 table ([O Povo](https://www.opovo.com.br/esportes/futebol/times/cearenses/2026/02/05/cbf-divulga-cotas-de-premiacao-da-copa-do-brasil-2026-confira.html), Poder360). Phases 1–4 pay Série B clubs `prize` and Série C, D and state clubs `prizeLowerDivisions`. Série A clubs enter at the fifth phase; from there everyone earns the same. |
| `libertadores`, `sulAmericana` | CONMEBOL 2026 prizes in USD ([Trivela](https://trivela.com.br/america-do-sul/premiacao-libertadores-sul-americana-2026-valores-fases-campeao/); Libertadores preliminary phases via Lance!). `group-win` is per win. |
| `usdToBrl` | `guess`: 5.5, a round figure near the 2025 average; no 2026 average was fetched. |
| `matchday.A` | 2025 average paying crowd 25,531 (Flashscore); ticket average R$51.35–53.20 ([Máquina do Esporte](https://maquinadoesporte.com.br/futebol/apesar-de-leve-recuo-no-publico-brasileirao-2025-registra-maior-arrecadacao-do-ultimo-trienio/)). |
| `matchday.B` | 2025 average crowd about 6,672; tickets R$25–43, stored as R$34 ([Mkt Esportivo](https://www.mktesportivo.com/2025/11/coritiba-tem-a-maior-presenca-nos-estadios-e-remo-registra-a-maior-receita-da-serie-b-2025/)). |
| `matchday.C` | 2025 crowds about 2,700–2,950 (A União); ticket price derived from reported takings. |
| `matchday.D` | `guess`: no league-wide figure; 2,000 crowd and R$20 ticket. |

## Sponsors (`sponsors.csv`, `sponsor-values.csv`, `brand-pool.csv`, `brands.csv`, `assets/logos/`)

Brazil banned betting sponsors on 25 September 2026; the game keeps them (SPEC §14), so every table is read as it stood on 24 September.

| File | Source |
|---|---|
| `sponsors.csv` | Séries A, B and C: the "Personnel and kits" table of the English Wikipedia season articles ([Série A](https://en.wikipedia.org/w/index.php?title=2026_Campeonato_Brasileiro_S%C3%A9rie_A&oldid=1376336637), [Série B](https://en.wikipedia.org/w/index.php?title=2026_Campeonato_Brasileiro_S%C3%A9rie_B&oldid=1376338710), [Série C](https://en.wikipedia.org/w/index.php?title=2026_Campeonato_Brasileiro_S%C3%A9rie_C&oldid=1376508539)): kit maker, main sponsor and, for A and B, the other sponsors by place (front, back, sleeves, shorts, socks, number). Série D and state-only clubs: the `material` field of each club's Portuguese Wikipedia infobox and, as the master, the first name of its `patrocinio` that isn't the kit maker (the field lists every sponsor with no place on the kit), found by Transfermarkt id through Wikidata (P7223). Each row keeps the revision it comes from. All 60 clubs of Séries A–C, 59 of 96 in Série D and 32 of 125 state-only clubs have rows; the other clubs have no Portuguese article or an empty infobox. The leagues abroad a coach can take come from the same table of their 2026–27 (2026 in Argentina and MLS) English Wikipedia season articles, by the world packs' clubs matched on name: England's, Spain's, Italy's, Germany's and France's first two divisions, the top divisions of Portugal, the Netherlands, Turkey, Scotland, Argentina, Saudi Arabia and Mexico, and 7 MLS clubs (the other MLS rows share cells across rows, which the parser doesn't follow): 323 clubs, with kit maker, chest, sleeve and back where listed. Belgium's article has no kit table. 1,416 rows in all. Coritiba, Grêmio, Internacional and Santos had no main sponsor in the table. `pipeline/fetch_sponsors.py`. |
| `sponsor-values.csv` | Yearly values and ends the press reported: Flamengo's kit from [InfoMoney](https://www.infomoney.com.br/esportes/flamengo-pode-bater-r-4676-milhoes-em-valor-de-uniforme-gracas-a-patrocinios/), [Trivela](https://trivela.com.br/brasil/flamengo-mantem-adidas-como-fornecedora-de-material-esportivo-ate-2029/) (adidas) and [Itatiaia](https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/futebol-carioca/flamengo/flamengo-acerta-com-novo-patrocinador-ate-2029-veja-valor-da-camisa/) (Ademicon); the 2026 masters of Palmeiras, São Paulo, Corinthians and Fluminense from [Times Brasil](https://timesbrasil.com.br/esportes/fla-x-flu-ate-fora-dos-campos-equipes-cariocas-rivalizam-no-top-5-de-maiores-patrocinios-do-futebol-brasileiro/); Atlético-MG, Botafogo, Cruzeiro and Bahia from [Lance!'s 2025 ranking](https://www.lance.com.br/lancebiz/maiores-acordos-de-patrocinio-master-no-brasil-veja-ranking-atualizado.html), kept where the 2026 table shows the same master (2025 values; Lance! notes they are estimates). The press calls all of these estimates. |
| `brand-pool.csv` | The brands that bid for a place on a kit in the game, by hand: 141 real brands (betting houses licensed in Brazil, banks, fintechs, retail, food, drinks, telecoms, cars, airlines, health, kit makers and more), each with a sector, a size (`giant` to `small`, a guess from how national the brand is) and its Wikipedia article and site. Some never sponsored a club; the game shows every offer as a fictional deal. |
| `brands.csv`, `assets/logos/` | Every brand of the two files above with its logo, `pipeline/fetch_brand_logos.py`: Wikidata's logo image (P154) on Wikimedia Commons, saved as Commons renders it to PNG 512 px wide, SVG where Commons has one; else, for brands in the pool, betting houses and Série A–B kits, a Commons file named after the brand's logo, each checked by hand in `brand-logo-checks.csv`; `brand-logos.csv` picks a file by hand where Wikidata's is an icon or missing (Betano, Guaraná Antarctica, Esportes da Sorte, Betfair, Viva Sorte); else the site's icon from [Google's favicon service](https://www.google.com/s2/favicons). `logo_source` is each logo's Commons page or favicon URL and `logo_licence` its licence as Commons states it (mostly public domain for text logos, some CC BY-SA 4.0); a site's icon carries none, so a favicon's reads "unknown licence; trademark; via Google favicon service". A white background is cleared; a logo still on an opaque tile is a `badge`. 313 of 969 brands have a logo (258 from Commons, 55 favicons); the rest are mostly small local firms with none, shown by name. Commons rations SVG renders, so a run may leave a logo for the next one. A brand outside the pool counts as a betting house when its name says so (`bet`, `sorte`, `aposta`, `blaze`, `stake`, `pixbet`). Trademarks are used as the crests are: a private game. |

How the game uses them (`packages/engine/src/sim/sponsors/`): a club's deals are a breakdown of its yearly `sponsorship` (finances.csv), which they leave as it is. A value the press didn't report is estimated from each place's share of Flamengo's: master 49.6%, kit 12.9%, front 10.5%, back 4.4%, sleeves 2.2% of its R$ 541 mi of commercial revenue; shorts, socks and number share the last 6.8% (a guess), split between the brands of a place and scaled to keep the deals within 95% of the club's sponsorship (guess). Press values that don't fit are scaled the same way and shown as estimates (Fluminense's R$ 86 mi and Atlético-MG's R$ 60 mi are above their 2025 commercial revenue). A deal's end the press never reported is a guess of one to three seasons (two to four for a kit maker). A club without rows gets a master and a kit maker from the pool, sized to its sponsorship, shown as fictional. The bookmaker's margin on the odds sticker is 6.26%, the average closing overround of the market's Série A odds from 2022 on in `history/brasileirao-serie-a-odds.csv` (football-data.co.uk, 1,809 matches; Bet365's alone is 6.61%). Every other rate there is marked `guess` in the code.

## Coach career (`packages/engine/src/sim/coach/`)

- Série A boards fire about 20 coaches a season (`judgeCoaches.ts`, Band: 22 changes in the 2025 Brasileirão with two rounds left, 17 in 2024) and 30% of Série A clubs change coach before a season (`startCoachSeason.ts`, Jornal de Brasília). Both now move named AI coaches: the fired one goes to the free pool and the club hires from it two weeks later (`moveAiCoaches.ts`; the two weeks are a guess, the time an offer waits for the player).
- Result-only countries judge their coaches on the first of each month from the table against the clubs' squad strength, calibrated to CIES's count for 2022/23: 484 of 850 teams (56.9%) changed coach during the season (https://football-observatory.com/Less-than-one-in-two-coaches-finished-the-season). Each country keeps its own coaches and pool; coaches don't move between countries (`guess`).
- National ranking, the CBF's Ranking Nacional de Clubes convention (`rankingPoints.ts`): Série A champion 800, B 400, C 200, D 100; runner-up 80%, third 75%, fourth 70%, then one percentage point less per place down to 51% at the 23rd, which every place below keeps; Copa do Brasil (since 2021) 600 champion, 480 runner-up, 450 semi-finalists, 400 quarter-finalists, 200 round of 16, then 100, 50, 25 for the three phases before; the last five seasons weigh 5, 4, 3, 2, 1 (https://pt.wikipedia.org/wiki/Ranking_da_CBF, https://trivela.com.br/brasil/como-funciona-o-ranking-da-cbf/). Mapping the 2026 format's extra early phases to 25 is `guess`. The CBF changed its convention for 2026 with the bigger Copa do Brasil (https://www.band.com.br/esportes/ranking-de-clubes-da-cbf-flamengo-segue-lider-e-corinthians-supera-rivais-202512241006); the new values weren't found, so the game keeps these.
- World club ranking and coach ranking (`guess`, after UEFA's and IFFHS's rankings, kept to what every country files): a top league's first ten places score the CBF's way from 800, a second level's champion 400, a national cup's finalists 600 and 480, continental winners (Club World Cup 1500, Libertadores and Champions League 1000, Intercontinental 700, Sul-Americana and Europa League 500, Recopa and UEFA Super Cup 300), all weighed by the club's country's factor (its top division's squad level against the strongest country's, squared), so a Brazilian Libertadores counts about 0.6 of an English Champions League. Checked against FootballDatabase's club ranking of 11 Oct 2026 (https://www.footballdatabase.com/ranking/world/1): 13 of its top 15 are European, Flamengo 11th and Palmeiras 26th. A European country enters the world ranking when it files its first season in the game, in July 2027. A coach earns his clubs' points for the share of the year he ran each.
- Guesses: resigning costs 2 reputation points and the old club won't hire the coach for two seasons; a player who peaked at strength 76 or more starts coaching two to four seasons after retiring, with his own first nationality; AI coaches retire at 72, or after two seasons without a club. A title goes to the coach in charge on the day of its final.
- What a save keeps (`closeCoachSeason.ts`): the five seasons of points the rankings read; for each closed season the CBF top 50, the full tier's clubs and coaches with points (top 50 per country, the human coaches always) and each result-only country's clubs and coaches that made the world's top 50, in raw points weighed by country when read; a coach's last five spells (`guess`), and retired coaches only with a title, recent points or a kept place, the retired ones with just their title-winning spells.

## Cards and suspensions (`packages/engine/src/sim/discipline/`, `packages/engine/src/engine/sendOffRates.ts`)

| Value | Source |
|---|---|
| Yellows and reds per side per match, home and away, and the share of reds that are a second yellow: Série A, Série B, Copa do Brasil | `history/espn/cards.csv`, 2024–2025 (760, 760 and 141 matches). Série C and D take Série B's rates and estaduais take the cup's (`guess`). |
| Red-card minute (mean 68) | Same file: mean minute 68.6 (A), 68.2 (B), 66.6 (cup). |
| Ten men score at 2/3 of their rate and the opponent at 5/4 for the rest of the match | Vecer, Kopriva & Ichiba (2009), J Quant Anal Sports 5(1), from live odds at the 2006 World Cup and Euro 2008, quoted by [Greenberg (2015)](https://www.nottingham.ac.uk/economics/documents/news/greenberg-2015-significance.pdf), Significance 12(4). A second red on one side applies the factors again (`guess`). |
| Three yellows in a competition ban the next match; yellows in a match that ends in a red don't count | RGC CBF art. 97, quoted by [Diário do Pará](https://diariodopara.com.br/bola/artilheiro-do-remo-nao-vai-enfrentar-o-coritiba-no-sabado/). |
| A red card bans the next match of that competition | RGC CBF art. 60, quoted by [FPF-PE](https://www.fpf-pe.com.br/assets/uploads/170837049013.pdf). A second match for half of straight reds stands in for the sports court (`guess`). |
| Copa do Brasil yellows are cleared once, when the Série A clubs join | [Lance](https://www.lance.com.br/flamengo/flamengo-tera-cartoes-zerados-para-a-final-saiba-o-que-diz-o-regulamento-da-copa-do-brasil.html) (2022: cleared after the second phase, the round before Série A entered). |
| Estaduais: three yellows per ban, cleared at the knockout stage | `guess`: state federations differ. |
| Aggressive trait: 10% of players, carded twice as often | `guess`: no public rate. |
