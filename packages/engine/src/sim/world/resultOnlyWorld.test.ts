import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import { cupFinal } from "./resultOnlyCup.js";
import { leagueMatches, leagueTable } from "./resultOnlyLeague.js";
import { endWorldSeason, playWorldDay, startCountry } from "./resultOnlyWorld.js";
import type { Country, CountryStructure, World, WorldClub } from "./world.js";

const STRUCTURE: CountryStructure = {
  id: "xx",
  levels: [
    { name: "Premier", legs: 2, promoted: 0, relegated: 3 },
    { name: "Championship", legs: 2, promoted: 3, relegated: 4 },
    { name: "League One", legs: 2, promoted: 4, relegated: 0 },
  ],
  window: ["02-01", "11-29"],
  continental: [
    { entry: "champions", from: "league", places: 4 },
    { entry: "europa", from: "league", places: 2 },
  ],
};

const SIZES = [20, 20, 24];

function squad(id: string, strength: number): WorldClub {
  return { id, name: id.toUpperCase(), positions: "GGDDDDDDMMMMMMAAAA", strengths: Array.from({ length: 18 }, (_, i) => strength - (i % 4)) };
}

function synthetic(): World {
  const levels = SIZES.map((size, level) => Array.from({ length: size }, (_, i) => squad(`l${level + 1}-${i}`, 80 - 10 * level - (i % 7))));
  return { xx: startCountry(STRUCTURE, levels, 2026, 7) };
}

function playSeason(world: World, season: number): World {
  let current = world;
  for (let date = `${season}-01-01`; date.startsWith(String(season)); date = addDays(date, 1)) current = playWorldDay(current, date);
  return current;
}

const membersOf = (country: Country | undefined) => country?.leagues.map((league) => [...league.clubIds].sort()) ?? [];

describe("a result-only country", () => {
  const start = synthetic();
  const played = playSeason(start, 2026);
  const country = played.xx;
  const tables = country?.leagues.map(leagueTable) ?? [];
  const next = endWorldSeason(played, 2027).xx;

  it("plays every league match of its season", () => {
    expect(country?.leagues.map((league) => leagueMatches(league).length)).toEqual([380, 380, 552]);
    expect(country?.leagues.every((league) => leagueMatches(league).every((m) => m.result !== null))).toBe(true);
  });

  it("is left untouched on a day none of its leagues plays", () => {
    expect(playWorldDay(start, "2026-01-15")).toBe(start);
  });

  it("promotes and relegates the clubs its table and counts say, keeping each level's size", () => {
    const [premier = [], championship = [], leagueOne = []] = tables;
    const before = membersOf(country);
    const expected = [
      [...premier.slice(0, 17), ...championship.slice(0, 3)],
      [...premier.slice(17), ...championship.slice(3, 16), ...leagueOne.slice(0, 4)],
      [...championship.slice(16), ...leagueOne.slice(4)],
    ].map((ids) => ids.sort());
    expect(membersOf(next)).toEqual(expected);
    expect(expected.map((ids) => ids.length)).toEqual(SIZES);
    expect(before).not.toEqual(expected);
  });

  it("files the season: champions, who went up and down, and the continental places from the top table", () => {
    const [premier = [], championship = [], leagueOne = []] = tables;
    expect(next?.seasons).toEqual([
      {
        season: 2026,
        champions: tables.map((table) => table[0]),
        promoted: [[], championship.slice(0, 3), leagueOne.slice(0, 4)],
        relegated: [premier.slice(17), championship.slice(16), []],
        continental: { champions: premier.slice(0, 4), europa: premier.slice(4, 6) },
        finals: { league: country?.leagues[0]?.dates.at(-1) },
      },
    ]);
  });

  it("opens next season's leagues with every match still to play", () => {
    expect(next?.leagues.map((league) => league.season)).toEqual([2027, 2027, 2027]);
    expect(next?.leagues.every((league) => leagueMatches(league).every((m) => m.result === null && m.date.startsWith("2027")))).toBe(true);
  });

  it("refuses a pyramid whose promotions and relegations don't match", () => {
    const broken = { ...STRUCTURE, levels: STRUCTURE.levels.map((level, i) => (i === 1 ? { ...level, promoted: 2 } : level)) };
    expect(() => startCountry(broken, SIZES.map((size) => Array.from({ length: size }, (_, i) => squad(`c${size}-${i}`, 60))), 2026, 1)).toThrow();
  });

  it.each([
    ["a position missing for a strength", { positions: "GDDDDMMMMA" }],
    ["fewer than eleven players", { positions: "GDDDMMMAA", strengths: Array.from({ length: 9 }, () => 60) }],
    ["no goalkeeper", { positions: "DDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => 60) }],
    ["a position that isn't G, D, M or A", { positions: "GDDDDMMMMAX", strengths: Array.from({ length: 11 }, () => 60) }],
  ])("refuses a club with %s", (_, change) => {
    const levels = SIZES.map((size, level) => Array.from({ length: size }, (_, i) => squad(`l${level}-${i}`, 60)));
    const [first = []] = levels;
    const sound: WorldClub = { id: "bad", name: "BAD", positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => 60) };
    first[0] = { ...sound, ...change };
    expect(() => startCountry(STRUCTURE, levels, 2026, 1)).toThrow(/bad/);
  });
});

const EUROPEAN: CountryStructure = {
  id: "yy",
  levels: [
    { name: "First", legs: 2, promoted: 0, relegated: 2 },
    { name: "Second", legs: 2, promoted: 2, relegated: 0 },
  ],
  window: ["08-15", "05-23"],
  rollover: "07-01",
  continental: [],
  uefa: { championsLeague: 2, europaLeague: 1 },
  hasCup: true,
};

function playDays(world: World, from: string, to: string): World {
  let current = world;
  for (let date = from; date < to; date = addDays(date, 1)) current = playWorldDay(current, date);
  return current;
}

describe("a result-only country whose season crosses the new year", () => {
  const levels = [10, 8].map((size, level) => Array.from({ length: size }, (_, i) => squad(`e${level + 1}-${i}`, 75 - 10 * level - i)));
  const start = { yy: startCountry(EUROPEAN, levels, 2026, 3) };
  const midway = playDays(start, "2026-01-01", "2027-01-01");
  const rolledAtNewYear = endWorldSeason(midway, 2027);
  const finished = playDays(rolledAtNewYear, "2027-01-01", "2027-07-01");
  const rolled = playWorldDay(finished, "2027-07-01");

  it("waits for August and plays its season into the next May, its cup with it", () => {
    expect(start.yy.leagues[0]?.dates[0]).toBe("2026-08-15");
    expect(start.yy.cup?.bracket.filter((id) => id)).toHaveLength(18);
    expect(finished.yy?.leagues.every((league) => leagueMatches(league).every((m) => m.result !== null))).toBe(true);
    expect(finished.yy?.cup && cupFinal(finished.yy.cup)).not.toBeNull();
  });

  it("keeps its season open across 1 January", () => {
    expect(rolledAtNewYear.yy).toBe(midway.yy);
  });

  it("files the season on its rollover day with its cup final and UEFA places, and opens the next", () => {
    const country = rolled.yy;
    const [top] = finished.yy?.leagues ?? [];
    const table = top ? leagueTable(top) : [];
    const record = country?.seasons.at(-1);
    expect(record?.season).toBe(2026);
    expect(record?.cup).toEqual(finished.yy?.cup && cupFinal(finished.yy.cup));
    expect(record?.continental["champions-league"]).toEqual(table.slice(0, 2));
    expect(record?.continental["europa-league"]).toHaveLength(1);
    expect(country?.leagues.map((league) => league.season)).toEqual([2027, 2027]);
    expect(country?.cup?.season).toBe(2027);
    expect(country?.leagues[0]?.dates[0]).toBe("2027-08-15");
  });

  it("keeps the days its league and cup were decided, before its rollover day", () => {
    const finals = rolled.yy?.seasons.at(-1)?.finals;
    expect(finals).toEqual({ league: finished.yy?.leagues[0]?.dates.at(-1), cup: finished.yy?.cup?.dates.at(-1) });
    expect(finals?.league).toBe("2027-05-23");
    expect(finals?.cup ?? "").toMatch(/^2027-0[45]-/);
  });
});

describe("the result-only leagues of different countries", () => {
  it("play at each league's own params: the same clubs score far more in Germany's top flight than in Argentina's", () => {
    const levels = (prefix: string) => SIZES.map((size, level) => Array.from({ length: size }, (_, i) => squad(`${prefix}${level + 1}-${i}`, 80 - 10 * level - (i % 7))));
    const played = playSeason({ de: startCountry({ ...STRUCTURE, id: "de" }, levels("de"), 2026, 7), ar: startCountry({ ...STRUCTURE, id: "ar" }, levels("ar"), 2026, 7) }, 2026);
    const goalsPerMatch = (id: string) => {
      const matches = leagueMatches(played[id]?.leagues[0] ?? { id, season: 2026, clubIds: [], legs: 2, drawOrder: [], dates: [], results: "" });
      return matches.reduce((sum, m) => sum + (m.result ? m.result.homeGoals + m.result.awayGoals : 0), 0) / Math.max(1, matches.length);
    };
    expect(goalsPerMatch("de") / goalsPerMatch("ar")).toBeGreaterThan(1.3);
  });
});
