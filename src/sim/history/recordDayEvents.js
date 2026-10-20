import { recordTransfer } from "./recordTransfer.js";
import { transfersOf } from "./transfersOf.js";
function closeStint(stints, date, left) {
    const last = stints.at(-1);
    return last && last.until === null ? [...stints.slice(0, -1), { ...last, until: date, left }] : stints;
}
function recordCoach(coach, event, date) {
    switch (event.type) {
        case "coachHired":
            return { ...coach, stints: [...closeStint(coach.stints, date, "moved"), { clubId: event.clubId, from: date, until: null, left: null }] };
        case "coachFired":
            if (!event.isYou)
                return coach;
            return {
                ...coach,
                stints: closeStint(coach.stints, date, "fired"),
                firings: [...coach.firings, { clubId: event.clubId, date, position: event.position, targetPosition: event.targetPosition }],
            };
        case "contractEnded":
            return { ...coach, stints: closeStint(coach.stints, date, "contractEnded") };
        case "coachSeasonReviewed":
            return { ...coach, seasons: [...coach.seasons, { season: event.season, clubId: event.clubId, position: event.position, targetPosition: event.targetPosition }] };
        default:
            return coach;
    }
}
/**
 * Writes the day's transfers and the player's coach career into the history. `before` is the state the
 * day started from: it still knows the players who were sold abroad today.
 */
export function recordDayEvents(state, events, before) {
    let history = state.history;
    for (const { fromId, ...transfer } of transfersOf(events, before)) {
        // Signings from abroad have no seller to credit.
        if (fromId)
            history = recordTransfer(history, { ...transfer, fromId });
    }
    for (const event of events) {
        const coach = recordCoach(history.coach, event, before.date);
        if (coach !== history.coach)
            history = { ...history, coach };
    }
    return history === state.history ? state : { ...state, history };
}
