import { advanceDay } from "../sim/advanceDay.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import { foreignShare } from "./foreignShare.js";
export const emptyFlow = (season) => ({ season, toEurope: 0, fromAbroad: 0, domestic: 0, freeAgents: 0, preContracts: 0, loans: 0 });
const COUNTED = {
    abroad: "toEurope",
    fromAbroad: "fromAbroad",
    transfer: "domestic",
    freeAgent: "freeAgents",
    preContract: "preContracts",
    loan: "loans",
};
/** Adds one move to a season's counts by kind. */
export function tallyMove(flow, move) {
    const key = COUNTED[move.kind];
    return key ? { ...flow, [key]: flow[key] + 1 } : flow;
}
/** Plays `seasons` whole seasons with no coach and counts each season's transfers by kind, plus the biggest fees. */
export function transferFlow(seed, seasons) {
    let state = loadNewGame(seed, { coachClubId: null });
    const flows = [];
    const top = [];
    const lastSeason = state.season + seasons - 1;
    let flow = emptyFlow(state.season);
    while (state.season <= lastSeason) {
        const before = state;
        const day = advanceDay(state, {});
        state = day.state;
        for (const event of day.events) {
            if (event.type !== "playerMoved")
                continue;
            flow = tallyMove(flow, event);
            if (event.fee > 0)
                top.push({ season: flow.season, name: event.name, kind: event.kind, from: event.fromClubId, to: event.toClubId, fee: event.fee });
        }
        if (!day.events.some((e) => e.type === "seasonEnded"))
            continue;
        flows.push({ ...flow, foreignShare: foreignShare(before) });
        flow = emptyFlow(state.season);
    }
    return { flows, top: top.sort((a, b) => b.fee - a.fee).slice(0, 15) };
}
