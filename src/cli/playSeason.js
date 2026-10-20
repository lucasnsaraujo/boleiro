import { advanceDay } from "../sim/advanceDay.js";
import { transfersOf } from "../sim/history/transfersOf.js";
/** Plays the current season to its end with no human decisions. */
export function playSeason(start) {
    let state = start;
    const fixtures = [];
    const injuries = [];
    const transfers = [];
    const moves = [];
    for (;;) {
        const day = advanceDay(state, {});
        for (const event of day.events) {
            if (event.type === "matchPlayed")
                fixtures.push(event.fixture);
            if (event.type === "playerInjured")
                injuries.push(event);
            if (event.type === "playerMoved")
                moves.push(event);
        }
        transfers.push(...transfersOf(day.events, state));
        if (day.events.some((e) => e.type === "seasonEnded"))
            return { before: state, after: day.state, fixtures, injuries, transfers, moves };
        state = day.state;
    }
}
