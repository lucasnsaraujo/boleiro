import { describe, expect, it } from "vitest";
import { RAPIDO, REALISTA } from "./formats.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadEurope } from "./world/loadEurope.js";
import { loadSouthAmerica } from "./world/loadSouthAmerica.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
const rapido = loadNewGame(1, { coachClubId: "flamengo-rj", world, formats: RAPIDO });

const leagueDates = (game: GameState, countryId: string, level = 0) => game.world?.[countryId]?.leagues[level]?.dates ?? [];
const cupDates = (game: GameState, countryId: string) => game.world?.[countryId]?.cup?.dates ?? [];
const stageDates = (game: GameState, competitionId: string) => game.competitions[competitionId]?.stageDates ?? [];

describe("the unified calendar", () => {
  it("plays round k of every league on the same day, Brasileirão and Premier League alike", () => {
    const leagues = [
      rapido.calendar.leagueDates.A,
      rapido.calendar.leagueDates.B,
      rapido.calendar.leagueDates.D,
      leagueDates(rapido, "gb-eng"),
      leagueDates(rapido, "gb-eng", 1),
      leagueDates(rapido, "es"),
      leagueDates(rapido, "ar"),
      leagueDates(rapido, "no"),
    ];
    for (const dates of leagues) expect(dates.length).toBeGreaterThan(10);
    const rounds = Math.min(...leagues.map((dates) => dates.length));
    for (let round = 0; round < rounds; round++) expect(new Set(leagues.map((dates) => dates[round])).size).toBe(1);
  });

  it("gives every league one season inside the calendar year, rolled over with Brazil's", () => {
    for (const country of Object.values(rapido.world ?? {})) {
      expect(country.structure.rollover).toBeUndefined();
      for (const league of country.leagues) for (const date of league.dates) expect(date.slice(0, 4)).toBe("2026");
    }
  });

  it("plays the national cups on the Copa do Brasil's midweeks", () => {
    const midweeks = new Set(rapido.calendar.copaDoBrasilRounds.flatMap((round) => round.dates));
    for (const id of ["gb-eng", "pt", "de"]) {
      expect(cupDates(rapido, id).length).toBeGreaterThan(3);
      for (const date of cupDates(rapido, id)) expect(midweeks.has(date)).toBe(true);
    }
  });

  it("plays the Champions League group days on the Libertadores' weeks and the Europa League's on the Sul-Americana's", () => {
    const libertadoresGroups = stageDates(rapido, "libertadores-2026")[3] ?? [];
    const sulAmericanaGroups = stageDates(rapido, "sul-americana-2026")[1] ?? [];
    const [championsLeague, europaLeague] = rapido.europe?.cups ?? [];
    expect(libertadoresGroups).toHaveLength(3);
    expect(championsLeague?.dates).toEqual(libertadoresGroups);
    expect(europaLeague?.dates).toEqual(sulAmericanaGroups);
  });

  it("keeps every league round clear of the continental match days", () => {
    const continental = [...Object.values(rapido.competitions).filter((c) => c.kind === "continental").flatMap((c) => c.stageDates.flat()), ...(rapido.europe?.cups.flatMap((cup) => cup.dates) ?? [])];
    const days = (date: string) => Date.parse(date) / 86_400_000;
    for (const date of rapido.calendar.leagueDates.A) for (const other of continental) expect(Math.abs(days(date) - days(other))).toBeGreaterThanOrEqual(2);
  });
});

describe("Realista", () => {
  const realista = loadNewGame(1, { coachClubId: "flamengo-rj", world, formats: REALISTA });

  it("keeps Europe's season from August to May", () => {
    expect(leagueDates(realista, "gb-eng")[0]).toBe("2026-08-15");
    expect(realista.world?.["gb-eng"]?.structure.rollover).toBe("07-01");
  });

  it("is the game started without formats, saved the same", () => {
    expect(JSON.stringify(realista)).toBe(JSON.stringify(loadNewGame(1, { coachClubId: "flamengo-rj", world })));
  });
});
