import { tierOf } from "../finances/tierOf.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { splitLoanWages } from "./wageBillsOf.js";
export function marketView(state) {
    const squads = squadsByClub(state.players);
    const bills = new Map();
    for (const [clubId, squad] of squads)
        bills.set(clubId, squad.reduce((sum, p) => sum + p.wage, 0));
    splitLoanWages(state, bills);
    return {
        squad: (clubId) => squads.get(clubId) ?? [],
        tier: (clubId) => tierOf(state.clubs[clubId] ?? { division: null }),
        bill: (clubId) => bills.get(clubId) ?? 0,
        record: (before, after) => {
            if (before) {
                squads.set(before.clubId, (squads.get(before.clubId) ?? []).filter((p) => p.id !== before.id));
                bills.set(before.clubId, (bills.get(before.clubId) ?? 0) - before.wage);
            }
            if (after) {
                squads.set(after.clubId, [...(squads.get(after.clubId) ?? []), after]);
                bills.set(after.clubId, (bills.get(after.clubId) ?? 0) + after.wage);
            }
        },
    };
}
