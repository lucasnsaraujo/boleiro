import { describe, expect, it } from "vitest";
import { valuePlayer } from "./valuePlayer.js";
const player = { strength: 72, age: 27, contractUntil: "2028-12-31" };
const on = "2026-07-01";
describe("valuePlayer", () => {
    it("puts a typical Série A player near the Série A median Transfermarkt value", () => {
        const value = valuePlayer(player, "A", on);
        expect(value).toBeGreaterThan(1_200_000);
        expect(value).toBeLessThan(2_500_000);
    });
    it("puts a typical Série B player near the Série B median Transfermarkt value", () => {
        const value = valuePlayer({ ...player, strength: 63 }, "B", on);
        expect(value).toBeGreaterThan(200_000);
        expect(value).toBeLessThan(500_000);
    });
    it("values stronger players more", () => {
        expect(valuePlayer({ ...player, strength: 78 }, "A", on)).toBeGreaterThan(2.5 * valuePlayer(player, "A", on));
    });
    it("values a 21-year-old above a 27-year-old and a 34-year-old well below", () => {
        const prime = valuePlayer(player, "A", on);
        expect(valuePlayer({ ...player, age: 21 }, "A", on)).toBeGreaterThan(prime);
        expect(valuePlayer({ ...player, age: 34 }, "A", on)).toBeLessThan(0.8 * prime);
    });
    it("values a player whose contract is about to end far below one with years left", () => {
        expect(valuePlayer({ ...player, contractUntil: "2026-12-31" }, "A", on)).toBeLessThan(0.6 * valuePlayer(player, "A", on));
    });
    it("values the same player less at a lower-division club", () => {
        expect(valuePlayer(player, "C", on)).toBeLessThan(valuePlayer(player, "A", on));
    });
});
