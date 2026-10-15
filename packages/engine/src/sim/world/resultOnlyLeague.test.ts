import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import { leagueMatches, leagueTable, openLeague, playLeagueDay } from "./resultOnlyLeague.js";
import type { WorldClub } from "./world.js";

const club = (id: string, strength: number): WorldClub => ({ id, name: id, positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => strength) });
const clubs = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`c${i}`, club(`c${i}`, 80 - 5 * i)]));
const clubOf = (id: string) => clubs[id] ?? club(id, 50);
const open = () => openLeague("x-1-2026", 2026, Object.keys(clubs), 2, ["03-01", "11-30"], seededRandom(1));

describe("a result-only league", () => {
  it("opens with one date per round inside its window and every match unplayed", () => {
    const league = open();
    expect(league.dates).toHaveLength(10);
    expect(new Set(league.dates).size).toBe(10);
    expect(league.dates[0]).toBe("2026-03-01");
    expect(league.dates.at(-1)).toBe("2026-11-30");
    expect(league.results).toBe("--".repeat(30));
  });

  it("runs into the next year when its window ends before it starts, as Europe's August to May", () => {
    const league = openLeague("x-1-2026", 2026, Object.keys(clubs), 2, ["08-15", "05-23"], seededRandom(1));
    expect(league.dates[0]).toBe("2026-08-15");
    expect(league.dates.at(-1)).toBe("2027-05-23");
    expect(league.dates.toSorted()).toEqual(league.dates);
  });

  it("has every club meet every other at home and away", () => {
    const pairs = leagueMatches(open()).map((m) => `${m.homeId}-${m.awayId}`);
    expect(new Set(pairs).size).toBe(30);
    for (const a of Object.keys(clubs)) for (const b of Object.keys(clubs)) if (a !== b) expect(pairs).toContain(`${a}-${b}`);
  });

  it("plays only the round dated today, and is left as it was on a day without one", () => {
    const league = open();
    expect(playLeagueDay(league, "2026-01-01", clubOf, seededRandom(2))).toBe(league);
    const played = playLeagueDay(league, league.dates[1] ?? "", clubOf, seededRandom(2));
    const matches = leagueMatches(played);
    expect(matches.filter((m) => m.result).map((m) => m.date)).toEqual(Array.from({ length: 3 }, () => league.dates[1]));
  });

  it("ranks its clubs by the points of the results played", () => {
    let league = open();
    for (const date of league.dates) league = playLeagueDay(league, date, clubOf, seededRandom(date.length + league.results.length));
    const matches = leagueMatches(league);
    const points = (id: string) =>
      matches.reduce((sum, { homeId, awayId, result }) => {
        if (!result) return sum;
        const [own, other] = homeId === id ? [result.homeGoals, result.awayGoals] : awayId === id ? [result.awayGoals, result.homeGoals] : [0, 0];
        if (homeId !== id && awayId !== id) return sum;
        return sum + (own > other ? 3 : own === other ? 1 : 0);
      }, 0);
    const table = leagueTable(league);
    expect(table).toHaveLength(6);
    for (let i = 1; i < table.length; i++) expect(points(table[i - 1] ?? "")).toBeGreaterThanOrEqual(points(table[i] ?? ""));
  });
});
