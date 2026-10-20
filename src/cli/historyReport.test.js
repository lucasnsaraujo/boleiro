import { describe, expect, it } from "vitest";
import { historyReport } from "./historyReport.js";
import { runCareer } from "./runCareer.js";
describe("historyReport", () => {
    const { final } = runCareer(2, 1);
    const champion = final.history.seasons[0]?.champions["serie-a"] ?? "";
    const report = historyReport(final, champion).join("\n");
    it("prints the club's titles, finishes, records and idols", () => {
        expect(report).toContain("2026 Série A");
        expect(report).toMatch(/2026: Série A, 1st/);
        expect(report).toMatch(/biggest win: \d+-\d+ vs /);
        expect(report).toMatch(/biggest crowd: [\d.]+ vs /);
        expect(report).toContain("idols");
    });
    it("prints every season's champions and the coach's career", () => {
        expect(report).toMatch(/2026 champions: Série A .*, Copa do Brasil /);
        expect(report).toMatch(/coach career/);
        expect(report).toMatch(/clubs: .* from 2026-/);
    });
});
