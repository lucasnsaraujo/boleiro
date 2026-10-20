import { clubStatures } from "./clubStatures.js";
import { firstPhaseTables } from "./firstPhaseTables.js";
// Clubs are ranked by stature inside their division; `biggest` is the share of the division (from the
// top) that gets each expectation. guess: the shares are judgement, about one club in seven of Série A
// is expected to fight for the title. The targets follow each league's rules: Série A sends six clubs to
// the Libertadores and relegates four (TecMundo,
// https://www.tecmundo.com.br/apostas/409831-brasileirao-2026-formato-datas-vagas-para-libertadores-e-sul-americana.htm);
// Série B promotes and relegates four; Série C's top 8 go to the promotion quadrangulars; Série D's top 4 per
// group go through and a group win is the promotion run's best start (see leagueFormats.ts).
const LADDERS = {
    A: [
        { biggest: 0.15, expectation: "title", target: () => 1 },
        { biggest: 0.35, expectation: "continental", target: () => 6 },
        { biggest: 0.6, expectation: "topHalf", target: (n) => n / 2 },
        { biggest: 1, expectation: "avoidRelegation", target: (n) => n - 4 },
    ],
    B: [
        { biggest: 0.25, expectation: "promotion", target: () => 4 },
        { biggest: 0.6, expectation: "topHalf", target: (n) => n / 2 },
        { biggest: 1, expectation: "avoidRelegation", target: (n) => n - 4 },
    ],
    C: [
        { biggest: 0.3, expectation: "promotion", target: () => 8 },
        { biggest: 0.6, expectation: "topHalf", target: (n) => n / 2 },
        // guess: Série C relegates 2 of 20 in 2026 and 6 of 24 from 2027; the board settles for the bottom 15%.
        { biggest: 1, expectation: "avoidRelegation", target: (n) => n - Math.round(0.15 * n) },
    ],
    D: [
        { biggest: 0.2, expectation: "promotion", target: () => 1 },
        { biggest: 0.6, expectation: "topHalf", target: (n) => n / 2 },
        { biggest: 1, expectation: "avoidRelegation", target: () => 4 },
    ],
};
/** Every national club's board at the start of the season, from its stature and division. */
export function boardExpectations(state) {
    const statures = clubStatures(state);
    const tables = firstPhaseTables(state);
    const boards = {};
    const events = [];
    for (const division of ["A", "B", "C", "D"]) {
        const members = Object.values(state.clubs)
            .filter((club) => club.division === division)
            .map((club) => club.id)
            .sort((a, b) => (statures.get(b) ?? 0) - (statures.get(a) ?? 0) || a.localeCompare(b));
        members.forEach((clubId, rank) => {
            const tableSize = tables.get(clubId)?.length;
            if (!tableSize)
                return;
            const rung = LADDERS[division].find((r) => rank < r.biggest * members.length) ?? LADDERS[division].at(-1);
            if (!rung)
                return;
            const targetPosition = Math.round(rung.target(tableSize));
            boards[clubId] = { expectation: rung.expectation, targetPosition, tableSize, position: targetPosition, games: 0, pressure: 0 };
            events.push({ type: "boardExpectationsSet", clubId, season: state.season, expectation: rung.expectation, targetPosition, tableSize });
        });
    }
    return { boards, events };
}
