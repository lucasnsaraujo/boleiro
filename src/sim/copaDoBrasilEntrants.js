import { STATES } from "../data/clubs.js";
import { COPA_DO_BRASIL_ENTRANTS, COPA_DO_BRASIL_ENTRY_STAGES } from "./copaDoBrasil.js";
// Copa do Brasil 2026 places per state federation: SP and RJ 6; MG, RS and PR 5; CE, PE, AL, MT, AM,
// GO, SC, BA and PA 4; the rest 3 (Lance,
// https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html).
// Simplified: a place goes to the best-placed club of the last estadual not in Série A, the way
// federations pass on places their Série A clubs do not need.
export const COPA_STATE_PLACES = {
    SP: 6, RJ: 6, MG: 5, RS: 5, PR: 5,
    CE: 4, PE: 4, AL: 4, MT: 4, AM: 4, GO: 4, SC: 4, BA: 4, PA: 4,
    AC: 3, AP: 3, DF: 3, ES: 3, MA: 3, MS: 3, PB: 3, PI: 3, RN: 3, RO: 3, RR: 3, SE: 3, TO: 3,
};
const TIER_ORDER = ["A", "B", "C", "D"];
const tierRank = (club) => (club.division ? TIER_ORDER.indexOf(club.division) : TIER_ORDER.length);
// guess: the CBF national club ranking (RNC) is approximated by division, then fanbase.
export function nationalRanking(clubs) {
    return [...clubs].sort((a, b) => tierRank(a) - tierRank(b) || b.fanbase - a.fanbase || a.id.localeCompare(b.id)).map((c) => c.id);
}
/** The Copa do Brasil field: `clubIds` in ranking order and the clubs that join at each stage. */
export function copaDoBrasilEntrants(clubs, qualification) {
    const ranking = nationalRanking(Object.values(clubs));
    const rank = (id) => ranking.indexOf(id);
    const serieA = ranking.filter((id) => clubs[id]?.division === "A");
    const entered = new Set(serieA);
    const take = (candidates, count) => {
        const taken = candidates.filter((id) => clubs[id] && !entered.has(id)).slice(0, count);
        for (const id of taken)
            entered.add(id);
        return taken;
    };
    const phase3 = take(qualification.phase3Ids, COPA_DO_BRASIL_ENTRANTS.phase3);
    const statePlaces = STATES.flatMap((state) => take(qualification.statePlacings[state] ?? ranking.filter((id) => clubs[id]?.state === state), COPA_STATE_PLACES[state]));
    // Places a state or the phase-3 list cannot fill go to the best-ranked clubs still out.
    phase3.push(...take(ranking, COPA_DO_BRASIL_ENTRANTS.phase3 - phase3.length));
    const viaStates = [...statePlaces, ...take(ranking, COPA_DO_BRASIL_ENTRANTS.phase1 + COPA_DO_BRASIL_ENTRANTS.phase2 - statePlaces.length)]
        .sort((a, b) => rank(a) - rank(b));
    const entries = Array.from({ length: COPA_DO_BRASIL_ENTRY_STAGES.serieA + 1 }, () => []);
    entries[COPA_DO_BRASIL_ENTRY_STAGES.phase1] = viaStates.slice(COPA_DO_BRASIL_ENTRANTS.phase2);
    entries[COPA_DO_BRASIL_ENTRY_STAGES.phase2] = viaStates.slice(0, COPA_DO_BRASIL_ENTRANTS.phase2);
    entries[COPA_DO_BRASIL_ENTRY_STAGES.phase3] = phase3;
    entries[COPA_DO_BRASIL_ENTRY_STAGES.serieA] = serieA;
    return { clubIds: ranking.filter((id) => entered.has(id)), entries };
}
