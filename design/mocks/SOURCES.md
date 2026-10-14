# Where the mocks' facts come from

The mocks show a career on Sunday 18 October 2026, the day of Bahia × Flamengo, round 31 of the Série A. Everything up to 14 October 2026 is real. Results after that date, and everything the game itself decides, are game state. All sources were read on 14 October 2026.

## Images

| What | Source |
|---|---|
| Crests of Brazilian clubs | The game's own `assets/crests/{tm_id}.png` (Transfermarkt, see `data/SOURCES.md`). The mocks load them from there and add nothing. |
| Crests of foreign clubs, Japan, Singapore and Uruguay flags | ESPN logos, `a.espncdn.com/i/teamlogos/soccer/500/{id}.png` and `.../countries/500/{code}.png`, trimmed and resized to 160 px in `img/crests/`. Team ids come from `site.api.espn.com/apis/site/v2/sports/soccer/{league}/teams`. |
| Brazil crest | Wikimedia Commons, `Brazilian_Football_Confederation_logo.svg` |
| Competitions (`img/competitions/`) | Wikimedia Commons: `Campeonato_Brasileiro_Série_A_logo_(2024).svg`, `..._Série_B_logo_(2025).svg`, `Copa_do_Brasil_logo_(2018).svg`, `Conmebol-libertadores.svg`, `Conmebol-sudamericana.svg`, `FIFA_logo_without_slogan.svg` |
| Sponsors (`img/logos/`) | Wikimedia Commons SVGs for Betano, adidas, BRB, Hapvida, Shopee, Texaco, Assist Card, Assaí, Granado, Guaraná Antarctica, Tok&Stok and Havaianas. Ademicon from its own site, `ademicon.com.br/api/media/file/ademicon.svg`. |

No real logo was found for GAC, WAP, Zé Delivery, the Bola de Prata or the Prêmio Brasileirão, so the mocks name those as text or draw the game's own ball badge.

## Facts

| Fact group | Where it shows | Source |
|---|---|---|
| Flamengo squad, positions, ages, strength, market value | every Flamengo screen | `data/players.csv`. Values in reais use the ECB rate of 13 Oct 2026, € 1 = R$ 5,61 ([Frankfurter/ECB](https://api.frankfurter.dev/v1/latest?from=EUR&to=BRL)). |
| Série A goals, assists and goals conceded per player, top scorers, Série A table and form after round 30 | hub, tables, history, market | ESPN, `site.api.espn.com/apis/v2/sports/soccer/bra.1/standings?season=2026`, `.../teams/{id}/roster`, `.../statistics` |
| Round 31 fixtures (Série A and B), Flamengo's October–December schedule and venues, last home games | live, calendar, stadium, player card | ESPN scoreboard and team schedule endpoints for `bra.1`, `bra.2`, `conmebol.libertadores` |
| 2026 qualification zones: 1–4 Libertadores, 5 qualifiers, 6–11 Sul-Americana, 17–20 relegated | tables | [Band](https://www.band.com.br/esportes/brasileirao-2026-novidades-nas-vagas-da-libertadores-e-para-transferencias-sao-confirmadas-202512160027), [Jovem Pan](https://jovempan.com.br/esportes/futebol/cbf-divulga-tabela-do-brasileirao-2026-e-muda-regras-de-transferencias-e-libertadores/) |
| Flamengo's 2026 debut, São Paulo away on 28 Jan | new career | [O Povo](https://www.opovo.com.br/esportes/futebol/2026/01/29/resultados-do-brasileirao-2026-veja-como-foi-a-1-rodada.html) |
| Libertadores 2026: group A table, round of 16 and quarter-final results, semi-final pairings and dates, final on 28 Nov at the Centenário | continental, calendar, penalties | [Wikipedia](https://en.wikipedia.org/wiki/2026_Copa_Libertadores), ESPN standings, [Tribuna de Jundiaí](https://tribunadejundiai.com.br/mais/esportes/libertadores-veja-as-datas-horarios-e-transmissoes-das-semifinais/) |
| Libertadores prize money, US$ 25 mi champion, US$ 7 mi runner-up | finances | [Trivela](https://trivela.com.br/america-do-sul/premiacao-libertadores-sul-americana-2026-valores-fases-campeao/) |
| Estudiantes coach Alexander Medina, goalkeeper Fernando Muslera; Rossi's two saves against them in the 2025 quarter-final | penalties | [Diario de Cuyo](https://www.diariodecuyo.com.ar/pasiondeportiva/estudiantes-de-la-plata-cerro-la-llegada-de-su-nuevo-entrenador-tras-la-sorpresiva-salida-de-eduardo-dominguez-1835795.html), ESPN roster, [Diario Jornada](https://diariojornada.com.ar/403101/deportes/con_rossi_figura_flamengo_elimino_por_penales_a_estudiantes) |
| Coaches of each club and when they started, and where Diniz, Luís Castro and Filipe Luís are | coaches, lineup, tactics, live, newspaper | [Wikipedia, Série A 2026 coaching changes](https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_S%C3%A9rie_A), [ncnews (Tite)](https://ncnews.com.br/2026/09/16/botafogo-anuncia-tite-como-novo-tecnico-com-contrato-ate-2028/), [dgabc (Filipe Luís)](https://www.dgabc.com.br/Noticia/4333470) |
| Benfica 2nd in the Liga Portugal | coaches, finances | [Wikipedia, 2026–27 Primeira Liga](https://en.wikipedia.org/wiki/2026%E2%80%9327_Primeira_Liga) |
| Série B table positions | coaches | ESPN standings for `bra.2` |
| Wilton Pereira Sampaio, 5,5 yellows per game in the 2025 Série A | tactics | [Itatiaia](https://www.itatiaia.com.br/bets/guias/media-de-cartoes-arbitros-brasileirao/) (a betting guide; best figure found) |
| Brazil: FIFA ranking 6th (7 Oct 2026), November window 9–17 Nov, friendlies against Japan (14 Nov) and Singapore (17 Nov) in Singapore | national team, calendar | [Jornal do Comércio](https://www.jornaldocomercio.com/esportes/2026/10/1266202-brasil-cai-para-sexto-no-ranking-da-fifa-e-e-ultrapassado-por-portugal.html), [Inside World Football](https://www.insideworldfootball.com/2026/09/03/cbf-announces-brazil-friendlies-japan-singapore/) |
| The players in the call-up and their clubs | national team | Brazil's last real squad, announced 9 Sep 2026: [Jornal de Brasília](https://jornaldebrasilia.com.br/torcida/ancelotti-convoca-26-para-amistosos-da-selecao-contra-australia-e-india/); clubs from ESPN athlete pages |
| Flamengo 2026 shirt: Betano (R$ 268,5 mi, to Dec 2028), adidas (R$ 70 mi, to 2029), BRB, Hapvida, Ademicon, Shopee, GAC, WAP, Assist Card, Zé Delivery, Texaco, total R$ 467,6 mi | sponsors, finances, hub | [Wikipedia, 2026 CR Flamengo season](https://en.wikipedia.org/wiki/2026_CR_Flamengo_season), [InfoMoney](https://www.infomoney.com.br/esportes/flamengo-pode-bater-r-4676-milhoes-em-valor-de-uniforme-gracas-a-patrocinios/), [Itatiaia](https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/futebol-carioca/flamengo/flamengo-acerta-com-novo-patrocinador-ate-2029-veja-valor-da-camisa/), [Trivela (adidas)](https://trivela.com.br/brasil/flamengo-mantem-adidas-como-fornecedora-de-material-esportivo-ate-2029/). Values are press estimates, not official. |
| Contract ends: Samuel Lino Dec 2029, Arrascaeta Dec 2028 with a € 35 mi release clause, Pedro Dec 2027, Danilo Dec 2026, Bruno Henrique Dec 2027 | hub, contract, player card, event, market sell | [ogol](https://www.ogol.com.br/jogador/samuel-lino/547971), [Exame (Arrascaeta)](https://exame.com/esporte/flamengo-renova-contrato-com-arrascaeta-ate-2028/), [Tupi (clause)](https://www.tupi.fm/?p=2203724), [tnh1 (Pedro)](https://www.tnh1.com.br/noticia/nid/flamengo-anuncia-renovacao-com-o-atacante-pedro-ate-dezembro-de-2027/), [A Gazeta (Danilo)](https://www.agazeta.com.br/futebol/danilo-e-anunciado-como-novo-reforco-do-flamengo-0125), [Flamengo (Bruno Henrique)](https://en.flamengo.com.br/noticias/futebol/bruno-henrique-renova-contrato-com-o-flamengo-ate-o-fim-de-2027) |
| Left-backs' contract ends and loans (Juba, Esquivel, Capixaba, Lodi, Bernabei, Cuiabano, Bidu, Telles, Piton, Arana, Luan Cândido, Rojas, Hermes) | market | [Diário de Pernambuco (Juba)](https://www.diariodepernambuco.com.br/esportes-dp/nacional/2025/12/11703778-luciano-juba-estende-contrato-com-o-bahia-ate-2029-de-olho-em-vaga-na-selecao-brasileira.html), [Itatiaia (Esquivel)](https://www.itatiaia.com.br/esportes/futebol/futebol-nacional/futebol-do-sul/athletico-pr/athletico-pr-renova-contrato-de-lucas-esquivel-veja-detalhes/), [Placar (Capixaba)](https://placar.com.br/placar/juninho-capixaba-renova-com-o-bragantino-ate-2027/), [Band (Lodi)](https://www.band.com.br/esportes/atletico-mg-confirma-a-contratacao-do-lateral-esquerdo-renan-lodi-para-os-proximos-cinco-anos-202512271727), [Netvasco (Cuiabano)](https://netvasco.com.br/n/393524/vasco-tem-9-jogadores-com-contrato-ate-dezembro-veja-situacoes), [O Liberal (Telles)](https://www.oliberal.com/esportes/botafogo-anuncia-a-renovacao-do-lateral-alex-telles-por-duas-temporadas-o-idolo-fica-1.1154444), [Band (Arana)](https://www.band.com.br/esportes/fluminense-oficializa-a-contratacao-do-lateral-guilherme-arana-202601041036), [Gazeta Esportiva (Luan Cândido)](https://www.gazetaesportiva.com/?p=3752936), [Portal Tela (Rojas)](https://www.portaltela.com/esporte/futebol/2026/06/18/cruzeiro-anuncia-primeira-contratacao-na-janela-de-transferencias/) |
| Samuel Lino's fee, € 22 mi in July 2025, and his career and Flamengo totals | hub, market sell | [ESPN](https://www.espn.com.br/futebol/mercado-da-bola/artigo/_/id/15468051/samuel-lino-flamengo-acerta-contratacao-atacante-atletico-madrid-r-144-milhoes-parcelados-bonus), [ogol](https://www.ogol.com.br/jogador/samuel-lino/547971) |
| Arrascaeta: right-footed, shirt 10, clubs and games (Defensor 65, Cruzeiro 186, Flamengo 389), 61 Uruguay caps, 18 Flamengo titles, wrist fracture on 28 Sep | player card, lineup, calendar | [ogol](https://www.ogol.com.br/jogador/giorgian-de-arrascaeta/270657), [Wikipedia](https://pt.wikipedia.org/wiki/Giorgian_de_Arrascaeta), [ge](https://ge.globo.com/futebol/times/flamengo/noticia/2026/03/08/arrascaeta-e-bruno-henrique-ampliam-recorde-de-titulos-pelo-flamengo-com-carioca-veja-ranking.ghtml) |
| Pedro: at Flamengo since 2020, 351 games and 175 goals | contract | [ogol](https://www.ogol.com.br/jogador/pedro/481359) |
| Flamengo titles before 2026, with coach, score and city | history | Wikipedia pages of the 2019, 2022 and 2025 Libertadores finals and Série A seasons |
| Zico 508 goals; Júnior 875 games | history | [Wikipedia (Zico)](https://en.wikipedia.org/wiki/Zico_(footballer)), [Lance](https://www.lance.com.br/flamengo/jogadores-com-mais-jogos-pelo-flamengo.html) |
| Brasileirão records: Washington 34 goals (2004), Roberto Dinamite 190 | awards | [Jovem Pan](https://jovempan.com.br/?p=474), Wikipedia |
| 2026 records: Vasco 5 × 0 Coritiba (19 Sep), Mirassol 1 × 5 Flamengo (16 Aug) | awards, history | ESPN schedules |
| Stadiums: Maracanã 78.838, Nubank Parque (Palmeiras), Arena da Baixada | stadium, new career, continental | [palmeiras.com.br](https://www.palmeiras.com.br/nubank-parque/), pt.wikipedia Série A 2026 table, [Band Paraná](https://www.band.com.br/band-parana/noticias/ligga-confirma-fim-de-contrato-com-o-athletico-202507251433) (end of the Ligga Arena name, 25 Jul 2025) |
| Flamengo wage bill R$ 627 mi a year (R$ 52,3 mi a month) and net debt R$ 473 mi | finances, new career, contract | `data/finances.csv` (EY 2025 report) |
| Aston Villa coach Unai Emery; Benfica coach Marco Silva | not shown; checked so no wrong name appears | Wikipedia |

## Game state

These numbers are the game's, chosen to be plausible and consistent across screens:

- The user's coach Lucas Araujo, in charge of Flamengo since January 2026 (the real coach is Leonardo Jardim), and of Brazil since August 2026 in the national-team mock.
- Every result after 14 October: Estudiantes 1 × 1 Flamengo, the round-31 scores, scorers and crowds, the round-31 newspaper and the awards in December.
- Cash (R$ 212,4 mi), monthly income and costs, board and fan meters, morale, energy, wages, traits, ratings, chemistry, penalty skill and asking prices.
- AI offers: Aston Villa's € 30 mi bid, Benfica's job offer and friendly, the auction bids, sponsor offers for 2027 and their values, the bank loan.
- Events and answers: Danilo's retirement talk, the press conference, the assistant Gilberto Paixão and the candidate Marcos Valadão, the reporter Renata Moura of the game's own "Jornal do Boleiro".
- Youth academy players, the betting odds, the coach ranking points and the open-jobs list.
- Strength of foreign players and the national-team ratings outside `data/players.csv`.

## Not verified

- Ademicon, BRB, Hapvida, Shopee and the five smaller deals have no public end date; the sponsors mock shows "—".
- Danilo said in mid-2026 he plans to stop at the end of his contract (Correio, Portal Tela); there is no official retirement announcement. The event mock is game state.
- Arrascaeta's career assists differ between Wikipedia (163 before 2026) and ogol (135); the card uses Wikipedia plus his 2026 games.
- Flamengo's net debt: `data/finances.csv` has R$ 473 mi (EY); Flamengo's own 2025 balance reports R$ 174 mi of "operational net debt" ([MKT Esportivo](https://www.mktesportivo.com/2026/04/flamengo-ultrapassa-r-2-bilhoes-em-receita-com-superavit-e-reducao-de-divida/)). The mock follows the game's data file.
