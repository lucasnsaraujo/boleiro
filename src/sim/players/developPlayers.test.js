import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { developPlayers } from "./developPlayers.js";
const start = loadNewGame(9, { coachClubId: null });
const regular = (p) => Number(p.id.slice(1)) % 2 === 0;
const playedSeason = {
    ...start,
    players: Object.fromEntries(Object.entries(start.players).map(([id, p]) => [
        id,
        { ...p, condition: { ...p.condition, seasonMinutes: regular(p) ? 30 * 90 : 0, seasonPoints: regular(p) ? 40 : 0 } },
    ])),
};
const { state: next, events } = developPlayers(playedSeason);
const survivors = Object.values(playedSeason.players).filter((p) => next.players[p.id]);
const change = (p) => (next.players[p.id]?.strength ?? 0) - p.strength;
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
const youth = Object.values(next.players).filter((p) => !playedSeason.players[p.id]);
const divisionOf = (p) => next.clubs[p.clubId]?.division ?? null;
describe("developPlayers at the end of a season", () => {
    it("ages every player by a year and clears the season's minutes", () => {
        expect(survivors.every((p) => next.players[p.id]?.age === p.age + 1)).toBe(true);
        expect(Object.values(next.players).every((p) => p.condition.seasonMinutes === 0 && p.condition.seasonPoints === 0)).toBe(true);
    });
    it("raises young players, holds the late twenties and lowers players past 31", () => {
        const at = (min, max) => mean(survivors.filter((p) => p.age >= min && p.age <= max).map(change));
        expect(at(17, 22)).toBeGreaterThan(0.25);
        expect(Math.abs(at(27, 30))).toBeLessThan(0.4);
        expect(at(32, 40)).toBeLessThan(-0.4);
    });
    it("improves regulars more than players who did not play", () => {
        const playing = mean(survivors.filter(regular).map(change));
        const benched = mean(survivors.filter((p) => !regular(p)).map(change));
        expect(playing - benched).toBeGreaterThan(0.5);
    });
    it("retires nobody under 29 and most players over 39", () => {
        const retired = new Set(events.filter((e) => e.type === "playerRetired").map((e) => e.playerId));
        const all = Object.values(playedSeason.players);
        expect(all.filter((p) => p.age < 29 && retired.has(p.id))).toEqual([]);
        const old = all.filter((p) => p.age >= 39);
        expect(old.filter((p) => retired.has(p.id)).length / old.length).toBeGreaterThan(0.4);
        expect(retired.size).toBeGreaterThan(200);
    });
    it("replaces retirees with Brazilian teenagers, stronger at bigger clubs", () => {
        expect(youth.length).toBeGreaterThanOrEqual(events.filter((e) => e.type === "playerRetired").length);
        expect(youth.every((p) => p.age >= 17 && p.age <= 19 && p.nationalities.join() === "Brazil" && p.name.length > 2)).toBe(true);
        expect(new Set(youth.map((p) => p.name)).size).toBeGreaterThan(youth.length * 0.7);
        const youthOf = (division) => mean(youth.filter((p) => divisionOf(p) === division).map((p) => p.strength));
        expect(youthOf("A")).toBeGreaterThan(youthOf("B"));
        expect(youthOf("B")).toBeGreaterThan(youthOf("D"));
        expect(youthOf("A") - youthOf("D")).toBeGreaterThan(15);
    });
    it("keeps every club with a squad of at least 18 and a wage for every newcomer", () => {
        const sizes = new Map();
        for (const p of Object.values(next.players))
            sizes.set(p.clubId, (sizes.get(p.clubId) ?? 0) + 1);
        expect(Math.min(...sizes.values())).toBeGreaterThanOrEqual(18);
        expect(youth.every((p) => p.wage > 0 && p.trait !== undefined)).toBe(true);
    });
    it("pays a thin club's academy players the division's going rate, not its lowest wage", () => {
        const thinId = Object.values(start.clubs).find((c) => c.division === "D")?.id ?? "";
        const kept = Object.values(playedSeason.players).filter((p) => p.clubId === thinId && p.age < 29).slice(0, 2);
        const others = Object.values(playedSeason.players).filter((p) => p.clubId !== thinId);
        const thin = { ...playedSeason, players: Object.fromEntries([...others, ...kept.map((p) => ({ ...p, wage: 50_000 }))].map((p) => [p.id, p])) };
        const after = Object.values(developPlayers(thin).state.players).filter((p) => !thin.players[p.id]);
        const thinYouth = after.filter((p) => p.clubId === thinId);
        const otherDYouth = after.filter((p) => p.clubId !== thinId && thin.clubs[p.clubId]?.division === "D");
        expect(thinYouth.length).toBeGreaterThanOrEqual(16);
        expect(Math.max(...thinYouth.map((p) => p.wage))).toBeLessThanOrEqual(Math.max(...otherDYouth.map((p) => p.wage)));
    });
    it("drops the pre-contracts and loans of players who retire", () => {
        const veterans = Object.values(playedSeason.players).filter((p) => p.age >= 38);
        const loan = { fromClubId: "flamengo-rj", until: "2026-12-31", lenderWageShare: 0.5, buyOption: null };
        const agreed = {
            ...playedSeason,
            market: {
                ...playedSeason.market,
                preContracts: Object.fromEntries(veterans.map((p) => [p.id, "flamengo-rj"])),
                loans: Object.fromEntries(veterans.map((p) => [p.id, loan])),
            },
        };
        const after = developPlayers(agreed).state;
        const retired = veterans.filter((p) => !after.players[p.id]);
        expect(retired.length).toBeGreaterThan(0);
        for (const p of retired)
            expect([after.market.preContracts[p.id], after.market.loans[p.id]], p.id).toEqual([undefined, undefined]);
        const stayed = veterans.find((p) => after.players[p.id]);
        expect(after.market.preContracts[stayed?.id ?? ""]).toBe("flamengo-rj");
    });
    it("draws from the game's random stream", () => {
        expect(next.rngState).not.toBe(playedSeason.rngState);
        expect(developPlayers(playedSeason).state).toEqual(next);
    });
});
