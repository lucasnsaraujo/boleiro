import { describe, expect, it } from "vitest";
import { loadCompetitionMoney } from "./competition-money.js";
const LOWER = ["B", "C", "D"];
const DIVISIONS = ["A", ...LOWER];
function isDescending(values) {
    return values.every((value, i) => i === 0 || value < (values[i - 1] ?? 0));
}
describe("loadCompetitionMoney", () => {
    const money = loadCompetitionMoney();
    it("is the 2026 season", () => {
        expect(money.season).toBe(2026);
    });
    it("splits the Série A TV pool into shares that add up to the whole", () => {
        const { equal, performance, audience } = money.tv.A.shares;
        expect(equal + performance + audience).toBeCloseTo(1);
        expect(money.tv.A.perClubMin).toBeLessThan(money.tv.A.perClubMax);
        expect(money.tv.A.perClubMax).toBeLessThan(money.tv.A.totalPool);
    });
    it("pays less TV money per club in every lower division", () => {
        const perClub = [money.tv.A.perClubMin, ...LOWER.map((division) => money.tv[division].perClub)];
        expect(isDescending(perClub)).toBe(true);
    });
    it("pays a bigger Copa do Brasil prize every round", () => {
        const prizes = money.copaDoBrasil.rounds.map((round) => round.prize);
        expect(prizes.length).toBeGreaterThanOrEqual(7);
        expect(isDescending([...prizes].reverse())).toBe(true);
    });
    it("pays more for the Libertadores group stage than the Sul-Americana one", () => {
        const groupStage = (stages) => stages.find((stage) => stage.stage === "group-stage")?.prizeUsd ?? 0;
        expect(groupStage(money.sulAmericana.stages)).toBeGreaterThan(0);
        expect(groupStage(money.libertadores.stages)).toBeGreaterThan(groupStage(money.sulAmericana.stages));
    });
    it("converts continental prizes to BRL at the stated rate", () => {
        const [first] = money.libertadores.stages;
        expect(first?.prize).toBeCloseTo((first?.prizeUsd ?? 0) * money.usdToBrl.rate);
    });
    it("draws smaller crowds in every lower division, at plausible ticket prices", () => {
        const attendance = DIVISIONS.map((division) => money.matchday[division].averageAttendance);
        expect(isDescending(attendance)).toBe(true);
        for (const division of DIVISIONS) {
            expect(money.matchday[division].averageTicketPrice, division).toBeGreaterThanOrEqual(10);
            expect(money.matchday[division].averageTicketPrice, division).toBeLessThanOrEqual(150);
        }
    });
    it("names a source for every value", () => {
        const sourced = [
            money.usdToBrl,
            money.tv.A,
            ...LOWER.map((division) => money.tv[division]),
            money.copaDoBrasil,
            money.libertadores,
            money.sulAmericana,
            ...DIVISIONS.map((division) => money.matchday[division]),
        ];
        expect(sourced.filter((entry) => entry.source.trim() === "")).toEqual([]);
    });
});
