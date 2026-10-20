import { openDisciplineDay } from "../discipline/recordCards.js";
import { recordMatchLoad } from "../players/recordMatchLoad.js";
/**
 * The coach's match recorded on its own: the players' load and its cards against the card records
 * the day started with. Only the two clubs' players are touched, and no other match of the day
 * involves them, so merging this into the day gives the same records as playing it in turn.
 */
export function coachOutcome(state, competition, match, random) {
    const { played, lineups } = match;
    if (!played.result)
        throw new Error(`fixture ${played.id} has no result`);
    const load = recordMatchLoad({ result: played.result, context: match.context, homeLineup: lineups.home, awayLineup: lineups.away, awayTravelKm: match.awayTravelKm }, match.injuries, match.minutes);
    const cards = openDisciplineDay(state.discipline);
    const cardEvents = cards.record(competition, played, match.bookings, (id) => state.players[id]?.clubId, random);
    const before = state.discipline[competition.id] ?? {};
    const after = cards.discipline()[competition.id] ?? {};
    return {
        fixture: played,
        events: [{ type: "matchPlayed", fixture: played }, ...load.events, ...cardEvents],
        players: load.players,
        discipline: Object.fromEntries(Object.entries(after).filter(([id, record]) => before[id] !== record)),
        sheet: { home: lineups.home, away: lineups.away, scorers: match.scorers },
    };
}
