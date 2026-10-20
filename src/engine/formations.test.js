import { describe, expect, it } from "vitest";
import { fittingFormation, inFormation } from "./formations.js";
const eleven = (shape) => Object.entries(shape).flatMap(([group, count]) => Array.from({ length: count }, (_, i) => ({ name: `${group}${i}`, group, strength: 60 + i })));
describe("inFormation", () => {
    it("puts every player of an eleven that fits the formation in his own position", () => {
        const players = inFormation(eleven({ GK: 1, DEF: 4, MID: 3, ATT: 3 }), "4-3-3");
        expect(players.every((p) => p.slot === p.group)).toBe(true);
    });
    it("moves the weakest spare players into the slots their group cannot fill", () => {
        const players = inFormation(eleven({ GK: 1, DEF: 4, MID: 4, ATT: 2 }), "4-3-3");
        const moved = players.filter((p) => p.slot !== p.group);
        expect(moved).toEqual([expect.objectContaining({ name: "MID0", slot: "ATT" })]);
    });
});
describe("fittingFormation", () => {
    it("picks the formation an eleven fills with nobody out of position", () => {
        expect(fittingFormation(eleven({ GK: 1, DEF: 5, MID: 3, ATT: 2 }))).toBe("5-3-2");
        expect(fittingFormation(eleven({ GK: 1, DEF: 4, MID: 5, ATT: 1 }))).toBe("4-5-1");
    });
    it("falls back to the 4-4-2 when no formation fits better", () => {
        expect(fittingFormation(eleven({ GK: 2, DEF: 4, MID: 4, ATT: 1 }))).toBe("4-4-2");
    });
});
