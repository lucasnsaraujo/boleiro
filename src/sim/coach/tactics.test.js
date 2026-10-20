import { describe, expect, it } from "vitest";
import { matchOdds } from "../../engine/match.js";
import { goalMinuteWeights } from "../live/matchTimeline.js";
import { engineTeam } from "../players/matchSetup.js";
import { freshCondition } from "../players/openingProfile.js";
import { aiPosture, DEFAULT_TACTICS } from "./tactics.js";
const player = (id, group, strength) => ({
    id, name: id, group, strength, clubId: "club", wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const shape = [["GK", 1], ["DEF", 4], ["MID", 4], ["ATT", 2]];
const fourFourTwo = shape.flatMap(([group, count]) => Array.from({ length: count }, (_, i) => player(`${group}${i}`, group, 70)));
const plain = (p) => p.strength;
const opponent = engineTeam("Away", fourFourTwo, plain);
describe("the coach's formation", () => {
    it("costs goals when it leaves his eleven out of position", () => {
        const fitting = matchOdds(engineTeam("Home", fourFourTwo, plain, DEFAULT_TACTICS), opponent);
        const misfit = matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, formation: "4-3-3" }), opponent);
        expect(fitting).toEqual(matchOdds(engineTeam("Home", fourFourTwo, plain), opponent));
        expect(misfit.expectedHomeGoals).toBeLessThan(fitting.expectedHomeGoals);
    });
});
describe("the coach's penalty taker", () => {
    const withTaker = (strength) => {
        const eleven = [...fourFourTwo.slice(0, -1), player("taker", "MID", strength)];
        return matchOdds(engineTeam("Home", eleven, plain, { ...DEFAULT_TACTICS, penaltyTakerId: "taker" }), opponent).expectedHomeGoals;
    };
    it("scores more penalties the stronger he is", () => {
        expect(withTaker(90)).toBeGreaterThan(withTaker(50));
    });
    it("counts only while he is on the pitch", () => {
        const absent = matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, penaltyTakerId: "someone-on-the-bench" }), opponent);
        expect(absent).toEqual(matchOdds(engineTeam("Home", fourFourTwo, plain, DEFAULT_TACTICS), opponent));
    });
});
describe("an AI coach's posture", () => {
    it("stays balanced until the score and the clock call for something else", () => {
        expect(aiPosture(-1, 30)).toBe("balanced");
        expect(aiPosture(-1, 70)).toBe("attacking");
        expect(aiPosture(1, 70)).toBe("balanced");
        expect(aiPosture(1, 80)).toBe("defensive");
        expect(aiPosture(0, 89)).toBe("balanced");
    });
});
describe("a red card in a live match", () => {
    it("cuts the ten men's goal chances and raises their opponent's from that minute on", () => {
        const tenMen = goalMinuteWeights([60], [], 0);
        const full = goalMinuteWeights([], [], 0);
        const against = goalMinuteWeights([], [60], 0);
        expect(tenMen.slice(0, 60)).toEqual(full.slice(0, 60));
        expect(tenMen[70]).toBeCloseTo(((full[70] ?? 0) * 2) / 3, 12);
        expect(against[70]).toBeCloseTo(((full[70] ?? 0) * 5) / 4, 12);
    });
});
