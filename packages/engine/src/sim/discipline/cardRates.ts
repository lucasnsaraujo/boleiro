import type { Division } from "@boleiro/data/players";
import { leagueAbroadKey } from "../../engine/paramsForLeagueAbroad.js";
import type { Competition } from "../gameState.js";
import type { CardCount } from "./discipline.js";

export type CardCompetition = Division | "cup" | "state";

/** Cards one side gets per match, at home and away, and the share of red cards that are a second yellow. */
export type CardRates = { home: CardCount; away: CardCount; secondYellowShare: number };

// Série A, Série B and Copa do Brasil 2024–2025 from ESPN match summaries (data/history/espn/cards.csv,
// pipeline/fetch_espn_cards.py): 760, 760 and 141 matches. A second-yellow red is one where the player
// had a yellow earlier in the match.
const SERIE_A: CardRates = { home: { yellows: 2.4, reds: 0.133 }, away: { yellows: 2.64, reds: 0.163 }, secondYellowShare: 87 / 225 };
const SERIE_B: CardRates = { home: { yellows: 2.48, reds: 0.15 }, away: { yellows: 2.68, reds: 0.166 }, secondYellowShare: 102 / 240 };
const CUP: CardRates = { home: { yellows: 2.13, reds: 0.142 }, away: { yellows: 2.57, reds: 0.135 }, secondYellowShare: 10 / 39 };

export const CARD_RATES: Record<CardCompetition, CardRates> = {
  A: SERIE_A,
  B: SERIE_B,
  // guess: ESPN lists no cards for Série C and has no Série D, and Sofascore is behind a captcha;
  // they take Série B's rates, the nearest division with data.
  C: SERIE_B,
  D: SERIE_B,
  cup: CUP,
  // guess: no estadual card data was fetched; state games take the cup's rates, as they take its engine params.
  state: CUP,
};

// guess: no CONMEBOL card data was fetched; the continental cups, the cups abroad and national teams' matches take the
// Copa do Brasil's rates. A league abroad counts with Série A, whose rates it borrows when it has none of its own (cardRatesOf).
export function cardCompetitionOf(competition: Competition): CardCompetition {
  if (competition.kind === "continental" || competition.kind === "cupAbroad" || competition.kind === "national") return "cup";
  return competition.kind === "league" ? (competition.division ?? "A") : competition.kind;
}

/** The real yellows and reds per game (both sides) behind a competition's rates. */
export function realCardsPerGame(competition: CardCompetition): CardCount {
  const { home, away } = CARD_RATES[competition];
  return { yellows: home.yellows + away.yellows, reds: home.reds + away.reds };
}

const abroad = (homeYellows: number, homeReds: number, awayYellows: number, awayReds: number): CardRates => ({
  home: { yellows: homeYellows, reds: homeReds },
  away: { yellows: awayYellows, reds: awayReds },
  secondYellowShare: SERIE_A.secondYellowShare,
});

/**
 * A league abroad's yellows and reds per side and match where football-data.co.uk lists them
 * (data/history/football-data/league-rates.csv, 2022/23 to 2025/26), by its key (`gb-eng-1`). guess: a red
 * is a second yellow as often as in Série A. The English and Scottish files leave out the first yellow of
 * a player sent off for a second (football-data.co.uk's notes.txt), about 1% of their yellows.
 */
export const LEAGUE_ABROAD_CARD_RATES: Readonly<Record<string, CardRates>> = {
  "be-1": abroad(1.767, 0.0921, 2.104, 0.1268),
  "de-1": abroad(1.876, 0.0777, 2.110, 0.0899),
  "de-2": abroad(2.118, 0.0817, 2.391, 0.1160),
  "es-1": abroad(2.229, 0.1276, 2.441, 0.1375),
  "es-2": abroad(2.319, 0.1115, 2.575, 0.1483),
  "fr-1": abroad(1.700, 0.1217, 1.975, 0.1186),
  "fr-2": abroad(1.771, 0.1059, 1.941, 0.1198),
  "gb-eng-1": abroad(1.788, 0.0586, 2.101, 0.0572),
  "gb-eng-2": abroad(1.721, 0.0448, 2.068, 0.0639),
  "gb-sct-1": abroad(1.717, 0.0899, 2.034, 0.1042),
  "gb-sct-2": abroad(1.846, 0.0736, 2.078, 0.0833),
  "gr-1": abroad(2.368, 0.1097, 2.815, 0.1487),
  "it-1": abroad(1.878, 0.0895, 2.209, 0.0934),
  "it-2": abroad(2.318, 0.1046, 2.597, 0.1421),
  "nl-1": abroad(1.314, 0.0776, 1.685, 0.0825),
  "pt-1": abroad(2.488, 0.1364, 2.642, 0.1487),
  "tr-1": abroad(2.214, 0.0948, 2.341, 0.1270),
};

/** The rates a competition's matches draw cards at: a league abroad's own where they were fetched, else Série A's; any other competition's by its card competition. */
export function cardRatesOf(competition: Competition): CardRates {
  if (competition.kind === "league" && competition.abroad) return LEAGUE_ABROAD_CARD_RATES[leagueAbroadKey(competition.abroad.country, competition.abroad.level)] ?? CARD_RATES.A;
  return CARD_RATES[cardCompetitionOf(competition)];
}
