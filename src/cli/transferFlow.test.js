import { beforeAll, describe, expect, it } from "vitest";
import { transferFlow } from "./transferFlow.js";
import { expectDomesticMoves, expectForeignersMostlyInSerieA, expectTalentToEurope } from "./transferFlowChecks.js";
// Ten seasons take most of a minute, so this only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of transfers", () => {
    let flows = [];
    beforeAll(() => {
        ({ flows } = transferFlow(1, 10));
    }, 300_000);
    it("covers ten seasons", () => {
        expect(flows).toHaveLength(10);
    });
    it("sends Brazilian talent to Europe every season", () => {
        expectTalentToEurope(flows);
    });
    it("keeps foreigners in Série A and rare in the lower divisions", () => {
        expectForeignersMostlyInSerieA(flows);
    });
    it("moves players between Brazilian clubs every season, for fees and for free", () => {
        expectDomesticMoves(flows);
    });
});
