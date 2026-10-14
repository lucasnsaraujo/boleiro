import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
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
});
