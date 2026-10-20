import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import { loadNewGame } from "../loadNewGame.js";
import { signFreeAgents } from "./signFreeAgents.js";
import { squadNeeds } from "./squadNeeds.js";
const start = loadNewGame(6, { coachClubId: null });
const clubId = Object.values(start.clubs).find((c) => c.division === "D")?.id ?? "";
const opening = start.finances[clubId];
if (!opening)
    throw new Error(`no finances for ${clubId}`);
const kept = Object.values(start.players).filter((p) => p.clubId === clubId).slice(0, 15);
const { level, thinnest } = squadNeeds(kept, "D");
const freeAgents = Object.fromEntries(Array.from({ length: 15 }, (_, i) => {
    const model = kept[0] ?? Object.values(start.players)[0];
    if (!model)
        throw new Error("no player");
    return [`free${i}`, { ...model, id: `free${i}`, clubId: "abroad", group: thinnest, strength: Math.round(level), age: 26 }];
}));
/** The club down to 15 players, too few to name a matchday squad, with free agents at its level to choose from. */
const thin = (finance) => ({
    ...start,
    players: Object.fromEntries(Object.entries(start.players).filter(([, p]) => p.clubId !== clubId || kept.includes(p))),
    finances: { ...start.finances, [clubId]: { ...opening, ...finance } },
    market: { ...start.market, freeAgents },
});
const signingsBy = (state) => signFreeAgents(state, seededRandom(3)).events.filter((e) => e.toClubId === clubId);
describe("AI clubs signing free agents", () => {
    it("fill a squad too thin to name a matchday squad when the money is there", () => {
        expect(signingsBy(thin({ cash: 1e9, wagesOwed: 0 })).length).toBeGreaterThan(0);
    });
    it("sign nobody, not even to fill the squad, while they owe wages or can't pay the signing costs", () => {
        expect(signingsBy(thin({ cash: 1e9, wagesOwed: 1 }))).toEqual([]);
        expect(signingsBy(thin({ cash: 0, wagesOwed: 0 }))).toEqual([]);
    });
});
