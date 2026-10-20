// Série A, Série B and Copa do Brasil 2024–2025 from ESPN match summaries (data/history/espn/cards.csv,
// pipeline/fetch_espn_cards.py): 760, 760 and 141 matches. A second-yellow red is one where the player
// had a yellow earlier in the match.
const SERIE_A = { home: { yellows: 2.4, reds: 0.133 }, away: { yellows: 2.64, reds: 0.163 }, secondYellowShare: 87 / 225 };
const SERIE_B = { home: { yellows: 2.48, reds: 0.15 }, away: { yellows: 2.68, reds: 0.166 }, secondYellowShare: 102 / 240 };
const CUP = { home: { yellows: 2.13, reds: 0.142 }, away: { yellows: 2.57, reds: 0.135 }, secondYellowShare: 10 / 39 };
export const CARD_RATES = {
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
export function cardCompetitionOf(competition) {
    return competition.kind === "league" ? competition.division : competition.kind;
}
/** The real yellows and reds per game (both sides) behind a competition's rates. */
export function realCardsPerGame(competition) {
    const { home, away } = CARD_RATES[competition];
    return { yellows: home.yellows + away.yellows, reds: home.reds + away.reds };
}
