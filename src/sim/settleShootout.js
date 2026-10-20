import { aggregate } from "./tieResults.js";
const PENALTY_SHOOTOUT_HOME_WIN = 0.5; // guess: shootouts treated as a coin flip until a source on shootout odds is used
function isDecidingLeg(fixture, competitions) {
    const stage = competitions[fixture.competitionId]?.stages[fixture.stage];
    return fixture.tie !== undefined && stage?.kind === "knockout" && stage.dates.at(-1) === fixture.date;
}
/** A just-played fixture with its shootout winner when it is a knockout tie's last leg and the aggregate is level. */
export function settleShootout(state, played, random) {
    if (!played.result || !isDecidingLeg(played, state.competitions))
        return played;
    const legs = [...state.fixtures.filter((f) => f.competitionId === played.competitionId && f.stage === played.stage && f.tie === played.tie && f.id !== played.id), played];
    if (aggregate(played.homeId, legs) !== aggregate(played.awayId, legs))
        return played;
    const penaltyWinnerId = random() < PENALTY_SHOOTOUT_HOME_WIN ? played.homeId : played.awayId;
    return { ...played, result: { ...played.result, penaltyWinnerId } };
}
