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

## crests.csv and assets/crests/

One row per club, built by `pipeline/fetch_crests.py`. The images ship inside the app so they work offline. They are not licensed: Boleiro is a personal game that is never sold.

| Column | Source |
|---|---|
| `crest` | Transfermarkt crest, `https://tmssl.akamaized.net/images/wappen/head/{tm_id}.png` (139×181 PNG, transparent), saved as `assets/crests/{tm_id}.png`. All 281 clubs had one on 2026-10-10. |
| `scoreboard_crest` | ESPN's 500×500 logo for the big scoreboard, saved as `assets/crests/scoreboard/{tm_id}.png`. Only for clubs that match an ESPN team with certainty: ESPN teams come from `site.api.espn.com/apis/site/v2/sports/soccer/{bra.1,bra.2,bra.copa_do_brazil}/teams`, and a match needs the same `team_key` name and the same division (`bra.1` is Série A, `bra.2` is Série B), with one candidate on each side, or a row in `espn-crest-matches.csv`. Cup-only ESPN teams have no division, so Série C, D and state-only clubs get none. Empty means no certain match. |

`espn-crest-matches.csv` holds hand-checked ESPN matches the name rule misses, each with how it was checked.

All files are recompressed losslessly with `oxipng`, which keeps the folder at about 8.5 MB.

## players.csv

`club_id` links each player to `clubs.csv`. Strength starts from a division baseline (A 72, B 63, C 56, D 49). State-only clubs start at 42, one step below Série D (`guess`, keeping the roughly 7-point gap between divisions). They have no Sofascore stats, so their strength moves only with market value and age.

The baselines were checked against Copa do Brasil 2017–2025 matches between divisions (`pnpm calibrate`) and left unchanged. With Série A's strength-to-goals curve, these gaps make cup favourites win far too often (Série A away at Série D or below: 89% simulated, 61% real). Squeezing the baselines to about a third of their gaps would fit the cup, but the cup is a biased witness: big clubs rest players, first-round favourites go through on a draw, and the small clubs that reach later rounds are the best of their division. So the cup gets its own flatter strength curve (`CUP_PARAMS` in `src/engine/paramsForDivision.ts`) and the league gaps stay. No league data compares divisions directly, because every 2026 squad is rated within its own 2026 division.

How the game uses `age` and `nationality` (`src/sim/players/`): each season a player's strength follows the 2026 squads' mean strength by age within a division (about 4 below the division level at 17, 1 above from 27 to 31, 4 below at 38), and players leave at the rate each age group shrinks in this file (about 6% a year from 29, rising to 70% past 40). Players whose nationalities don't include Brazil count as foreign. Injury, fatigue and travel rates name their studies in the code; every other rate there is marked `guess`.

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
| Copa do Brasil 2026 field: 126 clubs; 28 lowest-ranked in phase 1, 74 in phase 2, Série C, Série D, Copa do Nordeste and Copa Verde champions in phase 3, Série A's 20 in phase 5; level ties go to penalties, no away goals | [Super Rádio Tupi](https://www.tupi.fm/esportes/nova-era-copa-do-brasil-muda-formato-e-bate-recorde-em-2026/), [Lance](https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html), [O Imparcial](https://oimparcial.com.br/noticias/2026/02/copa-do-brasil-comeca-com-126-clubes-e-155-jogos-na-maior-edicao-da-historia/). The ranking (division, then fanbase), potted draws up to phase 5, lower-ranked hosts in single matches, a final hosted by one finalist (drawn) rather than at a neutral ground, and Série B's best two unpromoted clubs in place of the Nordeste and Verde champions are `guess`. |
| Copa do Brasil places per state: SP and RJ 6; MG, RS, PR 5; CE, PE, AL, MT, AM, GO, SC, BA, PA 4; others 3 | [Lance](https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html). Places go to the best-placed estadual clubs outside Série A. |
| Série D places from estaduais: two or three per state plus 14 national places by ranking | [Banda B](https://www.bandab.com.br/esporte/futebol/vagas-na-copa-do-brasil-serie-d-o-que-esta-em-jogo-mata-mata-paranaense/amp/), [Bahia Notícias](https://www.bahianoticias.com.br/esportes/noticia/79538-mudanca-na-serie-d-gera-duvida-sobre-vagas-do-baianao-2027-entenda-cenario). Simplified: two per state, leftovers one at a time to each state's next finisher in Copa-places order, so clubs outside the national leagues return only through their estadual. |
| State championships: one format for all 27 states, groups of up to six (one round each), top 8 (states with 12+ clubs) or top 4 to two-leg knockouts | Spec #2 settles one standard format; group size, qualifiers and legs are `guess`. State games use `CUP_PARAMS` (`guess`: mixed divisions, rested players). The first season seeds estaduais and the Copa from the ranking stand-in (`guess`). |
| Tie-break order: points, wins, goal difference, goals scored, head-to-head (two clubs only), red cards, yellow cards, draw | [Band](https://www.band.com.br/esportes/brasileirao-criterios-desempate), [TecMundo](https://www.tecmundo.com.br/apostas/409831-brasileirao-2026-formato-datas-vagas-para-libertadores-e-sul-americana.htm). Every competition uses this order. |

## Morale and organised supporters (`src/sim/morale/`)

| Value | Source |
|---|---|
| Disorder at a home game (CBJD art. 213): a fine of R$100–100,000, or for serious cases one to ten home games lost, not both | [ABC do ABC](https://abcdoabc.com.br/santos-pode-ser-punido-com-10-jogos/) quoting the article, [Migalhas](https://www.migalhas.com.br/depeso/101156/a-cronica-de-uma-violencia-anunciada---iv) on the one-or-the-other rule. The game plays those home games behind closed doors (no ticket money). How often disorder happens, the share that costs home games and the one-to-three-game range are `guess`. |
| Closed doors halve home advantage | Home sides' goal edge fell from 0.29 to 0.15 a game without fans ([McCarrick et al. 2021](https://northumbria.ac.uk/about-us/news-events/news/football-without-the-fans-new-study-reveals-effect-of-empty-stadiums-during-pandemic), Psychology of Sport and Exercise 56:101969). A larger 10-season study found a smaller, non-significant drop, so this may overstate it. |
| Rivals | `guess`: each state's four biggest fanbases are each other's rivals. |

Mood swings, escalation thresholds, the strength effect of morale (at most one point either way) and the crowd effect of fan mood (at most 10%) are all `guess`, marked in the code.

## Transfer market (`src/sim/transfers/`)

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

How the game uses these files (`src/sim/finances/openingFinances.ts`): each club's wage bill comes from its row (Série A) or from the small/median/large rows by squad strength rank in its division (Série B–D); state-only clubs are half a small Série D club (guess). TV money and crowds come from `competition-money.json`, not from the `broadcasting` and `matchday` columns. Sponsorship and membership come from the row. Gate money counts every opening home fixture (league, estadual group and Copa phase 1). Whatever the row's revenue without player sales holds beyond those lines, less the Copa do Brasil prizes the club can expect (`expectedPrizes`, `src/sim/finances/expectedCopaPrize.ts`: each tie a coin flip, a guess), becomes `otherIncome`, which stands for state championship, continental and other money the game does not simulate. Real Copa prizes are paid as they are won (`src/sim/finances/payCopaPrizes.ts`), so they count once. Each new season puts last season's expected prizes back into `otherIncome` and takes the new season's out. Every rate in `src/sim/finances/` names its source or is marked `guess` in the code.

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

## Cards and suspensions (`src/sim/discipline/`, `src/engine/sendOffRates.ts`)

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
