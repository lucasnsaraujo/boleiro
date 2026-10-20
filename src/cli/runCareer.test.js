import { describe, expect, it } from "vitest";
import { runCareer } from "./runCareer.js";
describe("runCareer", () => {
    const run = runCareer(4, 1);
    it("hires the auto-coach at a small club and reviews his season", () => {
        expect(run.lines[0]?.text).toMatch(/^hired by .* \(Série [CD]\)/);
        expect(run.lines.some((line) => line.text.startsWith("2026 at "))).toBe(true);
    });
    it("counts league firings for every division", () => {
        expect(run.firings.map((f) => f.division)).toEqual(["A", "B", "C", "D"]);
        expect(run.firings.find((f) => f.division === "A")?.count).toBeGreaterThan(5);
    });
});
