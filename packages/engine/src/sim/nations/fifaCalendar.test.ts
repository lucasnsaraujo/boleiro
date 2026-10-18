import { describe, expect, it } from "vitest";
import { fifaWindowsOf, worldCupOf } from "./fifaCalendar.js";

describe("the FIFA calendar", () => {
  it("has 2026's four windows and the World Cup between them", () => {
    expect(fifaWindowsOf(2026).map((w) => [w.from, w.until])).toEqual([
      ["2026-03-23", "2026-03-31"],
      ["2026-06-01", "2026-06-09"],
      ["2026-09-21", "2026-10-06"],
      ["2026-11-09", "2026-11-17"],
    ]);
    expect(worldCupOf(2026)).toEqual({ from: "2026-06-11", until: "2026-07-19" });
  });

  it("gives a two-match window two match days and the September-October one four", () => {
    const [march, , autumn] = fifaWindowsOf(2027);
    expect(march?.matchDays).toHaveLength(2);
    expect(autumn?.matchDays).toHaveLength(4);
    for (const window of fifaWindowsOf(2027)) for (const day of window.matchDays) expect(day >= window.from && day <= window.until).toBe(true);
  });

  it("holds a World Cup every four years and none between", () => {
    expect(worldCupOf(2030)).toEqual({ from: "2030-06-08", until: "2030-07-21" });
    expect(worldCupOf(2027)).toBeNull();
    expect(worldCupOf(2034)).not.toBeNull();
  });

  it("repeats the last known cycle after 2030, on the same weekdays", () => {
    const windows = fifaWindowsOf(2031);
    expect(windows).toHaveLength(4);
    expect(new Date(windows[0]?.from ?? "").getUTCDay()).toBe(new Date(fifaWindowsOf(2027)[0]?.from ?? "").getUTCDay());
  });
});
