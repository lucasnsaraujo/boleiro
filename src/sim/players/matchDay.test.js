import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { addDays } from "../dates.js";
import { loadNewGame } from "../loadNewGame.js";
import { effectiveStrength } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";
import { isInjured } from "./isInjured.js";
import { matchInjuryChance } from "./matchInjuryChance.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
const start = loadNewGame(5, { coachClubId: "flamengo-rj" });
const firstDate = start.calendar.leagueDates.A[0] ?? "";
function advanceTo(state, date) {
    let current = state;
    while (current.date < date)
        current = advanceDay(current, {}).state;
    return current;
}
// Estadual games come before the first league date; the tests start from players fresh on that day.
const matchDay = { ...advanceTo(start, firstDate), players: start.players };
const squadOf = (state, clubId) => Object.values(state.players).filter((p) => p.clubId === clubId);
const withPlayers = (state, change) => ({
    ...state,
    players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, ...change(p) }])),
});
function injuriesOver(state, seeds) {
    let starts = 0;
    const injuries = [];
    for (let seed = 0; seed < seeds; seed++) {
        const { events } = advanceDay({ ...state, rngState: seed }, {});
        starts += events.filter((e) => e.type === "matchPlayed").length * 22;
        injuries.push(...events.filter((e) => e.type === "playerInjured"));
    }
    return { starts, injuries };
}
const fresh = withPlayers(matchDay, () => ({ trait: null }));
// 60 match days (about 13,000 starts) put the band's edges about three standard errors from the study's rate.
const baseline = injuriesOver(fresh, 60);
describe("injuries", () => {
    it("happen at the UEFA injury study's match rate of 27.5 per 1000 hours", () => {
        const perStart = baseline.injuries.length / baseline.starts;
        expect(perStart).toBeGreaterThan(0.036);
        expect(perStart).toBeLessThan(0.047);
    });
    it("keep players out for 18 days on average", () => {
        const mean = baseline.injuries.reduce((sum, e) => sum + e.days, 0) / baseline.injuries.length;
        expect(mean).toBeGreaterThan(15);
        expect(mean).toBeLessThan(21);
        expect(Math.max(...baseline.injuries.map((e) => e.days))).toBeGreaterThan(28);
    });
    it("happen about twice as often to injury-prone players", () => {
        const prone = injuriesOver(withPlayers(matchDay, () => ({ trait: "injuryProne" })), 30);
        const ratio = prone.injuries.length / prone.starts / (baseline.injuries.length / baseline.starts);
        expect(ratio).toBeGreaterThan(1.7);
        expect(ratio).toBeLessThan(2.3);
    });
    it("are more likely on artificial turf and for tired players", () => {
        const player = squadOf(fresh, "flamengo-rj")[0];
        if (!player)
            throw new Error("no Flamengo player");
        const grass = matchInjuryChance(player, { date: firstDate, pitch: "natural" });
        expect(matchInjuryChance(player, { date: firstDate, pitch: "artificial" })).toBeCloseTo(grass * 1.1, 3);
        const tired = { ...player, condition: { ...player.condition, fatigue: 100, fatigueOn: firstDate } };
        expect(matchInjuryChance(tired, { date: firstDate, pitch: "natural" })).toBeGreaterThan(grass * 1.5);
    });
    it("keep the player out of the lineup until he is fit again", () => {
        const injury = baseline.injuries.find((e) => e.days > 5);
        if (!injury)
            throw new Error("no injury long enough");
        const seed = Array.from({ length: 30 }, (_, s) => s).find((s) => advanceDay({ ...fresh, rngState: s }, {}).events.some((e) => e.type === "playerInjured" && e.playerId === injury.playerId));
        const after = advanceDay({ ...fresh, rngState: seed ?? 0 }, {}).state;
        const injured = after.players[injury.playerId];
        if (!injured)
            throw new Error("injured player is gone");
        expect(isInjured(injured, addDays(firstDate, injury.days - 1))).toBe(true);
        expect(isInjured(injured, injury.fitOn)).toBe(false);
        const nextGame = { date: addDays(firstDate, 3), pitch: "natural" };
        expect(pickMatchLineup(squadOf(after, injured.clubId), nextGame).map((p) => p.id)).not.toContain(injured.id);
    });
    it("stop the coach from fielding an injured player", () => {
        const flamengo = squadOf(matchDay, "flamengo-rj").slice(0, 11);
        const [first] = flamengo;
        if (!first)
            throw new Error("no Flamengo player");
        const hurt = { ...matchDay, players: { ...matchDay.players, [first.id]: { ...first, condition: { ...first.condition, injuredUntil: addDays(firstDate, 10) } } } };
        expect(() => advanceDay(hurt, { lineup: flamengo.map((p) => p.id) })).toThrow(/injured/);
    });
});
describe("fatigue", () => {
    const { state: played } = advanceDay(fresh, {});
    const starters = Object.values(played.players).filter((p) => p.condition.seasonMinutes === 90);
    it("builds up in the players who played, more after a long away trip", () => {
        expect(starters.length).toBeGreaterThan(100);
        const fixture = played.fixtures.find((f) => f.date === firstDate && played.clubs[f.homeId]?.state !== played.clubs[f.awayId]?.state);
        const host = starters.find((p) => p.clubId === fixture?.homeId);
        const visitor = starters.find((p) => p.clubId === fixture?.awayId);
        expect(host?.condition.fatigue).toBeCloseTo(100);
        expect(visitor?.condition.fatigue).toBeGreaterThan(100);
    });
    it("recovers with rest days", () => {
        const player = starters[0];
        if (!player)
            throw new Error("nobody played");
        const after = (days) => fatigueOn(player, addDays(firstDate, days));
        expect(after(1)).toBeLessThan(after(0));
        expect(after(3)).toBeLessThan(35);
        expect(after(7)).toBeLessThan(5);
    });
    it("makes tired players play below their strength", () => {
        const player = starters[0];
        if (!player)
            throw new Error("nobody played");
        const rested = { ...player, condition: { ...player.condition, fatigue: 0 } };
        const nextDay = { date: addDays(firstDate, 1), pitch: "natural" };
        expect(effectiveStrength(player, nextDay)).toBeLessThan(effectiveStrength(rested, nextDay));
    });
});
describe("AI lineups", () => {
    const squad = squadOf(fresh, "palmeiras-sp");
    const context = { date: firstDate, pitch: "natural" };
    it("pick the strongest fit 4-4-2", () => {
        const lineup = pickMatchLineup(squad, context);
        const count = (group) => lineup.filter((p) => p.group === group).length;
        expect([count("GK"), count("DEF"), count("MID"), count("ATT")]).toEqual([1, 4, 4, 2]);
        const bestKeeper = Math.max(...squad.filter((p) => p.group === "GK").map((p) => p.strength));
        expect(lineup.find((p) => p.group === "GK")?.strength).toBe(bestKeeper);
    });
    it("rest tired starters in a congested week but not after a week off", () => {
        const first = pickMatchLineup(squad, context);
        const tiredAt = (date) => squad.map((p) => (first.includes(p) ? { ...p, condition: { ...p.condition, fatigue: 100, fatigueOn: date } } : p));
        const ids = (players) => players.map((p) => p.id);
        const threeDaysLater = pickMatchLineup(tiredAt(addDays(firstDate, -3)), context);
        const weekLater = pickMatchLineup(tiredAt(addDays(firstDate, -7)), context);
        const kept = (lineup) => ids(lineup).filter((id) => ids(first).includes(id)).length;
        expect(kept(threeDaysLater)).toBeLessThan(kept(weekLater) - 2);
        expect(kept(weekLater)).toBeGreaterThan(7);
    });
});
describe("pitch and adaptation", () => {
    const player = squadOf(fresh, "flamengo-rj")[0];
    if (!player)
        throw new Error("no Flamengo player");
    it("cost a poor-on-turf player strength on artificial pitches only", () => {
        const turfHater = { ...player, trait: "poorOnArtificialTurf" };
        expect(effectiveStrength(turfHater, { date: firstDate, pitch: "artificial" })).toBeLessThan(player.strength);
        expect(effectiveStrength(turfHater, { date: firstDate, pitch: "natural" })).toBe(player.strength);
        expect(effectiveStrength(player, { date: firstDate, pitch: "artificial" })).toBe(player.strength);
    });
    it("hold back a newly arrived foreign player for his first half-season", () => {
        const newcomer = { ...player, nationalities: ["Uruguay"], condition: { ...player.condition, arrivedOn: firstDate } };
        const on = (days) => effectiveStrength(newcomer, { date: addDays(firstDate, days), pitch: "natural" });
        expect(on(0)).toBeLessThan(player.strength - 3);
        expect(on(90)).toBeGreaterThan(on(0));
        expect(on(200)).toBe(player.strength);
        const brazilian = { ...newcomer, nationalities: ["Brazil", "Italy"] };
        expect(effectiveStrength(brazilian, { date: firstDate, pitch: "natural" })).toBe(player.strength);
    });
});
