import type { Competition, Fixture } from "../gameState.js";
import { cardCompetitionOf, type CardCompetition } from "./cardRates.js";
import type { CardCount } from "./discipline.js";

export type CardsPerGame = CardCount & { games: number };

/** Simulated yellows and reds per game (both sides) by division, cup and estaduais, over played fixtures; leagues abroad left out. */
export function cardsPerGame(fixtures: readonly Fixture[], competitions: Record<string, Competition>): Partial<Record<CardCompetition, CardsPerGame>> {
  const sums = new Map<CardCompetition, CardsPerGame>();
  for (const { competitionId, result } of fixtures) {
    const competition = competitions[competitionId];
    if (!competition || !result?.cards || (competition.kind === "league" && competition.abroad)) continue;
    const key = cardCompetitionOf(competition);
    const sum = sums.get(key) ?? { games: 0, yellows: 0, reds: 0 };
    sums.set(key, {
      games: sum.games + 1,
      yellows: sum.yellows + result.cards.home.yellows + result.cards.away.yellows,
      reds: sum.reds + result.cards.home.reds + result.cards.away.reds,
    });
  }
  const perGame: Partial<Record<CardCompetition, CardsPerGame>> = {};
  for (const [key, { games, yellows, reds }] of sums) perGame[key] = { games, yellows: yellows / games, reds: reds / games };
  return perGame;
}
