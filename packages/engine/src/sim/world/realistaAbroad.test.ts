import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { daysBetween } from "../dates.js";
import { REALISTA } from "../formats.js";
import type { GameState, LeagueCompetition } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { uefaMatchDays } from "../continental/uefaCups.js";
import { loadEurope } from "./loadEurope.js";
import { loadSouthAmerica } from "./loadSouthAmerica.js";

const ARSENAL = "tm-11";
const RIVER = "tm-209";
const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
const start = loadNewGame(5, { coachClubId: ARSENAL, world, formats: REALISTA });

const englishLeagues = (state: GameState, season: number): LeagueCompetition[] =>
  Object.values(state.competitions).flatMap((c) => (c.kind === "league" && c.abroad?.country === "gb-eng" && c.season === season ? [c] : []));

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const uefaDays = (state: GameState) => (state.europe?.cups ?? []).flatMap((cup) => [...cup.dates, ...cup.knockout.flatMap((round) => round.dates)]);

describe("a Realista career at an English club", () => {
  const [premier, championship] = englishLeagues(start, 2026);

  it("plays England's 2026/27 season on its own calendar, mid-August to late May", () => {
    const dates = premier?.stageDates.flat() ?? [];
    expect(dates).toHaveLength(38);
    expect((dates[0] ?? "") >= "2026-08-15").toBe(true);
    expect((dates.at(-1) ?? "9999") <= "2027-05-23").toBe(true);
    expect(championship?.stageDates.flat()).toHaveLength(46);
    expect(start.fixtures.filter((f) => f.competitionId === premier?.id && (f.homeId === ARSENAL || f.awayId === ARSENAL))).toHaveLength(38);
  });

  it("keeps its league days clear of UEFA's match days", () => {
    const uefa = uefaDays(start);
    for (const date of premier?.stageDates.flat() ?? []) expect(uefa.every((day) => Math.abs(daysBetween(date, day)) >= 1)).toBe(true);
  });

  it("keeps Brazil on its own calendar year beside it", () => {
    const serieA = Object.values(start.competitions).find((c) => c.kind === "league" && c.division === "A");
    expect(serieA?.season).toBe(2026);
    expect((serieA?.stageDates.flat()[0] ?? "9999") < "2026-03-01").toBe(true);
  });

  describe("across Brazil's new year", () => {
    const december = playUntil(start, "2026-12-31");
    const january = playUntil(december, "2027-01-02");
    const playedBy = (state: GameState) => state.fixtures.filter((f) => f.competitionId === premier?.id && f.result).length;

    it("carries the Premier League's half-played season, its games and table, into Brazil's 2027", () => {
      expect(january.season).toBe(2027);
      expect(englishLeagues(january, 2026).map((league) => league.id)).toEqual([premier?.id, championship?.id]);
      expect(playedBy(january)).toBe(playedBy(december));
      expect(playedBy(january)).toBeGreaterThan(100);
      expect(englishLeagues(january, 2027)).toEqual([]);
    });

    it("keeps the club's cup matches abroad as the full tier played them, cards and all", () => {
      const isCupAbroad = (state: GameState, id: string) => state.competitions[id]?.kind === "cupAbroad";
      const played = december.fixtures.filter((f) => isCupAbroad(december, f.competitionId) && f.result);
      expect(played.length).toBeGreaterThan(3);
      const kept = new Map(january.fixtures.map((f) => [f.id, f]));
      for (const fixture of played) expect(kept.get(fixture.id)).toEqual(fixture);
    });

    it("saves and loads the two seasons side by side", () => {
      expect(loadGame(saveGame(january))).toEqual(january);
    });

    describe("on England's own turn of the season, 1 July", () => {
      const june = playUntil(january, "2027-06-30");
      const july = playUntil(june, "2027-07-02");
      const record = july.world?.["gb-eng"]?.seasons.at(-1);
      const [nextPremier, nextChampionship] = englishLeagues(july, 2027);

      it("plays every game of England's 2026/27 before it turns", () => {
        expect(june.fixtures.filter((f) => f.competitionId === premier?.id).every((f) => f.result)).toBe(true);
        expect(june.history.current.champions["gb-eng-1"]).toBe(record?.champions[0]);
      });

      it("files 2026/27 from the full tier's tables and moves its pyramid", () => {
        expect(record?.season).toBe(2026);
        expect(record?.relegated[0]).toHaveLength(3);
        for (const id of record?.relegated[0] ?? []) expect(july.clubs[id]?.abroad?.level).toBe(1);
        for (const id of record?.promoted[1] ?? []) expect(july.clubs[id]?.abroad?.level).toBe(0);
        expect(record?.continental["champions-league"]).toHaveLength(5);
      });

      it("opens 2027/28 in the full tier on its calendar, its boards set for it", () => {
        expect(nextPremier?.clubIds).toHaveLength(20);
        expect(nextChampionship?.clubIds).toHaveLength(24);
        for (const id of record?.promoted[1] ?? []) expect(nextPremier?.clubIds).toContain(id);
        expect((nextPremier?.stageDates.flat()[0] ?? "") >= "2027-08-15").toBe(true);
        expect(july.fixtures.filter((f) => f.competitionId === nextPremier?.id && f.result)).toEqual([]);
        expect(july.world?.["gb-eng"]?.leagues).toEqual([]);
        const promoted = record?.promoted[1]?.[0] ?? "";
        expect(july.boards[promoted]?.tableSize).toBe(20);
      });

      it("drops 2026/27's finished leagues at Brazil's next turn of the year, which reviews the coach on them", () => {
        const next = playUntil(july, "2028-01-02");
        expect(englishLeagues(next, 2026)).toEqual([]);
        expect(next.fixtures.some((f) => f.competitionId === premier?.id)).toBe(false);
        expect(englishLeagues(next, 2027).map((league) => league.id)).toEqual([nextPremier?.id, nextChampionship?.id]);
      });

      it("sends the clubs its tables qualified to UEFA's next season", () => {
        const field = new Set(july.europe?.cups.flatMap((cup) => cup.clubIds));
        expect(july.europe?.season).toBe(2027);
        for (const id of record?.continental["champions-league"] ?? []) expect(field.has(id)).toBe(true);
      });
    });
  });
});

describe("a Realista career at a club whose league plays the calendar year", () => {
  const river = loadNewGame(5, { coachClubId: RIVER, world, formats: REALISTA });

  it("plays Argentina's season in its own window, clear of CONMEBOL's days", () => {
    const league = Object.values(river.competitions).find((c) => c.kind === "league" && c.abroad?.country === "ar" && c.abroad.level === 0);
    const dates = league?.stageDates.flat() ?? [];
    expect(dates.length).toBeGreaterThan(20);
    expect((dates[0] ?? "") >= "2026-01-24").toBe(true);
    expect((dates.at(-1) ?? "9999") <= "2026-12-06").toBe(true);
  });
});

describe("a Realista career at a European club whose league plays the calendar year", () => {
  it("opens its next season's cup off its league's and UEFA's days after Brazil's turn of the year", () => {
    const bodo = playUntil(loadNewGame(5, { coachClubId: "tm-501", world, formats: REALISTA }), "2027-01-02");
    const leagueDays = new Set([
      ...Object.values(bodo.competitions).flatMap((c) => (c.kind === "league" && c.abroad?.country === "no" && c.season === 2027 ? c.stageDates.flat() : [])),
      ...uefaMatchDays(2027, REALISTA),
    ]);
    const cup = bodo.world?.["no"]?.cup;
    expect(cup?.season).toBe(2027);
    expect(leagueDays.size).toBeGreaterThan(20);
    expect((cup?.dates ?? []).filter((date) => leagueDays.has(date))).toEqual([]);
  });
});
