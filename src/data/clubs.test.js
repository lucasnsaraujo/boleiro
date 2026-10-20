import { describe, expect, it } from "vitest";
import { loadClubs } from "./clubs.js";
describe("loadClubs", () => {
    const clubs = loadClubs();
    it("has every 2026 Série A–D club, with the national division sizes", () => {
        const count = (division) => clubs.filter((club) => club.division === division).length;
        expect([count("A"), count("B"), count("C"), count("D")]).toEqual([20, 20, 20, 96]);
    });
    it("adds clubs that only play their state championship", () => {
        expect(clubs.filter((club) => club.division === null).length).toBeGreaterThan(100);
    });
    it("gives every club a unique id", () => {
        expect(new Set(clubs.map((club) => club.id)).size).toBe(clubs.length);
    });
    it("covers all 27 state championships", () => {
        expect(new Set(clubs.map((club) => club.state)).size).toBe(27);
    });
    it("names a source for every value", () => {
        const unsourced = clubs.filter((club) => Object.values(club.sources).some((source) => source === ""));
        expect(unsourced).toEqual([]);
    });
    it("gives every club a stadium, hex colours and a fanbase", () => {
        const hex = /^#[0-9A-F]{6}$/;
        const incomplete = clubs.filter((club) => !club.stadium ||
            club.capacity === 0 ||
            club.fanbase === 0 ||
            !hex.test(club.colours.primary) ||
            !hex.test(club.colours.secondary));
        expect(incomplete).toEqual([]);
    });
    it("marks the big artificial pitches", () => {
        const artificial = clubs.filter((club) => club.pitch === "artificial").map((club) => club.shortName);
        expect(artificial).toEqual(expect.arrayContaining(["Palmeiras", "Athletico-PR"]));
    });
});
