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
