import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { seasonEndField, type ContinentalField } from "../continental/continentalField.js";
import { RAPIDO, REALISTA } from "../formats.js";
import type { GameState, LeagueCompetition } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "./loadEurope.js";
import { loadSouthAmerica } from "./loadSouthAmerica.js";

const ARSENAL = "tm-11";
const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
const start = loadNewGame(5, { coachClubId: ARSENAL, world, formats: RAPIDO });

const englishLeagues = (state: GameState): LeagueCompetition[] =>
  Object.values(state.competitions).flatMap((c) => (c.kind === "league" && c.abroad?.country === "gb-eng" && c.season === state.season ? [c] : []));

/** The season played to its last day, and the first day of the next. */
function playSeason(state: GameState): { last: GameState; next: GameState } {
  let current = state;
  for (;;) {
    const day = advanceDay(current, {});
    if (day.events.some((e) => e.type === "seasonEnded")) return { last: current, next: day.state };
    current = day.state;
  }
}

describe("a career at a club abroad", () => {
  it("brings the club's country into the full tier: clubs, squads with wages, money and a board", () => {
    const arsenal = start.clubs[ARSENAL];
    expect(arsenal?.abroad).toEqual({ country: "gb-eng", level: 0 });
    const squad = Object.values(start.players).filter((p) => p.clubId === ARSENAL);
    expect(squad.length).toBeGreaterThanOrEqual(18);
    for (const player of squad) expect(player.wage).toBeGreaterThan(0);
    expect(start.finances[ARSENAL]?.cash).toBeGreaterThan(0);
    expect(start.boards[ARSENAL]).toBeDefined();
    expect(Object.values(start.clubs).filter((club) => club.abroad?.country === "gb-eng")).toHaveLength(44);
  });

  it("gives its players their ages from Transfermarkt, as Brazil's", () => {
    const ageOf = (name: string) => Object.values(start.players).find((p) => p.clubId === ARSENAL && p.name === name)?.age;
    expect(ageOf("David Raya")).toBe(31);
    expect(ageOf("William Saliba")).toBe(25);
    expect(ageOf("Cristhian Mosquera")).toBe(22);
  });

  it("plays its leagues minute by minute on the unified grid, and no longer result-only", () => {
    const [premier, championship] = englishLeagues(start);
    expect(premier?.clubIds).toHaveLength(20);
    expect(championship?.clubIds).toHaveLength(24);
    expect(premier?.stageDates[0]).toEqual(start.calendar.leagueGrid?.slice(0, 38));
    expect(start.fixtures.some((f) => f.competitionId === premier?.id && (f.homeId === ARSENAL || f.awayId === ARSENAL))).toBe(true);
    expect(start.world?.["gb-eng"]?.leagues).toEqual([]);
    expect(start.world?.["gb-eng"]?.cup).toBeDefined();
  });

  it("keeps its clubs out of Brazil's competitions", () => {
    const brazilian = Object.values(start.competitions).filter((c) => !(c.kind === "league" && c.abroad));
    for (const competition of brazilian) expect(competition.clubIds.some((id) => start.clubs[id]?.abroad)).toBe(false);
  });

  it("needs the unified calendar", () => {
    expect(() => loadNewGame(5, { coachClubId: ARSENAL, world, formats: REALISTA })).toThrow(/unified calendar/);
  });

  describe("over a whole season", () => {
    const { last, next } = playSeason(start);
    const [premier, championship] = englishLeagues(last);

    it("plays every league game, the coach's club 38", () => {
      const played = last.fixtures.filter((f) => f.competitionId === premier?.id);
      expect(played).toHaveLength(380);
      expect(played.every((f) => f.result)).toBe(true);
      expect(played.filter((f) => f.homeId === ARSENAL || f.awayId === ARSENAL)).toHaveLength(38);
    });

    it("files the season from its tables: champion, three up and three down, and UEFA places", () => {
      const record = next.world?.["gb-eng"]?.seasons.at(-1);
      expect(record?.season).toBe(2026);
      expect(record?.relegated[0]).toHaveLength(3);
      expect(record?.promoted[1]).toHaveLength(3);
      for (const id of record?.relegated[0] ?? []) expect(next.clubs[id]?.abroad?.level).toBe(1);
      for (const id of record?.promoted[1] ?? []) expect(next.clubs[id]?.abroad?.level).toBe(0);
      expect(premier?.clubIds).toContain(record?.champions[0]);
      expect(record?.continental["champions-league"]).toHaveLength(5);
      expect(championship?.clubIds).toContain(record?.promoted[1]?.[0]);
    });

    it("keeps the coach's squad at its level through the season's development", () => {
      const bestEleven = (state: GameState) => Object.values(state.players).filter((p) => p.clubId === ARSENAL).map((p) => p.strength).sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0) / 11;
      expect(bestEleven(next)).toBeGreaterThan(bestEleven(start) - 2);
    });

    it("opens the next season with the moved clubs and, on 1 January, the places in UEFA's cups", () => {
      const [nextPremier, nextChampionship] = englishLeagues(next);
      const newYear = advanceDay(next, {}).state;
      expect(nextPremier?.season).toBe(2027);
      expect(nextPremier?.clubIds).toHaveLength(20);
      expect(nextChampionship?.clubIds).toHaveLength(24);
      const record = next.world?.["gb-eng"]?.seasons.at(-1);
      for (const id of record?.promoted[1] ?? []) expect(nextPremier?.clubIds).toContain(id);
      const field = new Set(newYear.europe?.cups.flatMap((cup) => cup.clubIds));
      expect(newYear.europe?.season).toBe(2027);
      for (const id of record?.continental["champions-league"] ?? []) expect(field.has(id)).toBe(true);
    });
  });
});

describe("a career at a South American club abroad", () => {
  const RIVER = "tm-209";
  const river = loadNewGame(5, { coachClubId: RIVER, world, formats: RAPIDO });
  const argentinesIn = (field: ContinentalField | null) => (field ? Object.entries(field.countries).filter(([, country]) => country === "ar").length : 0);

  it("still sends its country's clubs to CONMEBOL's cups, each as Argentine", () => {
    const libertadores = river.competitions["libertadores-2026"];
    if (libertadores?.kind !== "continental") throw new Error("no Libertadores");
    expect(Object.values(libertadores.countries).filter((country) => country === "ar").length).toBeGreaterThanOrEqual(5);
    expect(argentinesIn(seasonEndField(river))).toBeGreaterThanOrEqual(12);
  });
});

describe("a league abroad's clubs over the years", () => {
  it("set their boards by club size, the five biggest aiming at least as high as any of the five smallest", () => {
    const english = Object.values(start.clubs).filter((club) => club.abroad?.country === "gb-eng" && club.abroad.level === 0).toSorted((a, b) => b.fanbase - a.fanbase);
    const targetOf = (id: string) => start.boards[id]?.targetPosition ?? 0;
    const lowestBigAim = Math.max(...english.slice(0, 5).map((club) => targetOf(club.id)));
    const highestSmallAim = Math.min(...english.slice(-5).map((club) => targetOf(club.id)));
    expect(lowestBigAim).toBeLessThan(highestSmallAim);
  });
});
