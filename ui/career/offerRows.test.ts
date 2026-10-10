import { expect, test } from "vitest";
import type { JobOffer } from "../../src/sim/coach/coach.js";
import { offerRows } from "./offerRows.js";

const offer = (clubId: string, salary: number, expiresOn: string): JobOffer => ({ clubId, salary, untilSeason: 2026, expiresOn });
const clubs = { "a-club": { division: "A" as const }, "c-club": { division: "C" as const }, "d-club": { division: "D" as const }, "d-rich": { division: "D" as const } };

test("offers come biggest division first, then best paid, with the days left to answer", () => {
  const offers = [offer("d-club", 4_000, "2026-01-15"), offer("c-club", 9_000, "2026-01-03"), offer("d-rich", 6_000, "2026-01-01")];
  const rows = offerRows({ date: "2026-01-01", coach: { offers }, clubs });
  expect(rows.map((r) => [r.clubId, r.division, r.daysLeft])).toEqual([
    ["c-club", "C", 3],
    ["d-rich", "D", 1],
    ["d-club", "D", 15],
  ]);
});

test("a coach with no offers has no rows", () => {
  expect(offerRows({ date: "2026-01-01", coach: { offers: [] }, clubs })).toEqual([]);
});
