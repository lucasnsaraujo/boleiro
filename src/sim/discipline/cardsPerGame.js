import { cardCompetitionOf } from "./cardRates.js";
/** Simulated yellows and reds per game (both sides) by division, cup and estaduais, over played fixtures. */
export function cardsPerGame(fixtures, competitions) {
    const sums = new Map();
    for (const { competitionId, result } of fixtures) {
        const competition = competitions[competitionId];
        if (!competition || !result?.cards)
            continue;
        const key = cardCompetitionOf(competition);
        const sum = sums.get(key) ?? { games: 0, yellows: 0, reds: 0 };
        sums.set(key, {
            games: sum.games + 1,
            yellows: sum.yellows + result.cards.home.yellows + result.cards.away.yellows,
            reds: sum.reds + result.cards.home.reds + result.cards.away.reds,
        });
    }
    const perGame = {};
    for (const [key, { games, yellows, reds }] of sums)
        perGame[key] = { games, yellows: yellows / games, reds: reds / games };
    return perGame;
}
