import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import { compareText } from "./compareText.js";
import { isClubWorldCupSeason } from "./continental/clubWorldCup.js";
import { continentalDates } from "./continental/continentalDays.js";
import { RAPIDO, REALISTA, type Formats } from "./formats.js";
import type { GameState, IsoDate, LeagueCompetition } from "./gameState.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { loadNewGame } from "./loadNewGame.js";
import { isInFifaWindow, worldCupOf } from "./nations/fifaCalendar.js";
import { seasonCalendar } from "./seasonCalendar.js";
import { loadEurope } from "./world/loadEurope.js";
import { loadGuests } from "./world/loadGuests.js";
import { loadMarketLeagues } from "./world/loadMarketLeagues.js";
import { loadSouthAmerica } from "./world/loadSouthAmerica.js";

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const counts = { A: 38, B: 38, C: 27, D: 22 };

describe("seasonCalendar", () => {
  for (const season of [2026, 2027, 2031]) {
    describe(`season ${season}`, () => {
      const calendar = seasonCalendar(season, counts);
      const reserved = [...calendar.stateChampionshipDates, ...calendar.copaDoBrasilRounds.flatMap((round) => round.dates)];

      it("gives each league the dates it asks for, inside the season year", () => {
        for (const division of ["A", "B", "C", "D"] as const) {
          const dates = calendar.leagueDates[division];
          expect(dates).toHaveLength(counts[division]);
          expect(dates.every((date) => date.startsWith(`${season}-`))).toBe(true);
        }
      });

      it("leaves at least two rest days between any two of a club's possible games", () => {
        for (const dates of Object.values(calendar.leagueDates)) {
          const all = [...dates, ...reserved].sort();
          for (let i = 1; i < all.length; i++) expect(days(all[i - 1] ?? "", all[i] ?? "")).toBeGreaterThanOrEqual(3);
        }
      });

      it("reserves 11 state championship dates from January and the Copa do Brasil from February to December", () => {
        expect(calendar.stateChampionshipDates).toHaveLength(11);
        expect(calendar.stateChampionshipDates[0]?.slice(5, 7)).toBe("01");
        expect(calendar.copaDoBrasilRounds[0]?.dates[0]?.slice(5, 7)).toBe("02");
        expect(calendar.copaDoBrasilRounds.at(-1)?.dates.at(-1)?.slice(5, 7)).toBe("12");
      });

      it("with national football, rests Série A in the FIFA windows and plays the other series through them", () => {
        const resting = seasonCalendar(season, counts, [], undefined, 0, true);
        expect(resting.leagueDates.A).toHaveLength(counts.A);
        expect(resting.leagueDates.A.filter(isInFifaWindow)).toEqual([]);
        expect(resting.leagueDates.B.some(isInFifaWindow)).toBe(true);
        expect(calendar.leagueDates.A.some(isInFifaWindow)).toBe(true);
      });

      it("plays league rounds on weekends and midweek", () => {
        const weekdays = new Set(calendar.leagueDates.A.map((date) => new Date(date).getUTCDay()));
        expect(weekdays.has(3)).toBe(true);
        expect(weekdays.has(0) || weekdays.has(6)).toBe(true);
      });
    });
  }

  it("throws when a league needs more dates than its window holds", () => {
    expect(() => seasonCalendar(2026, { ...counts, D: 200 })).toThrow();
  });
});

const SEASONS = Array.from({ length: 20 }, (_, i) => 2026 + i);
const MODES: Record<string, Formats> = {
  Realista: REALISTA,
  Rápido: RAPIDO,
  "Personalizar, real calendar and short cups": { calendar: "real", leagueLegs: 1, continentalGroups: "groups-3", knockouts: "single" },
  "Personalizar, unified calendar and full cups": { calendar: "unified", leagueLegs: 2, continentalGroups: "league-phase", knockouts: "two-legs" },
};
const isPausedForWorldCup = (season: number, hasNationalFootball: boolean, formats: Formats) => hasNationalFootball && formats.calendar === "real" && worldCupOf(season) !== null;
const isAscendingApart = (dates: readonly IsoDate[]) => dates.every((date, i) => i === 0 || days(dates[i - 1] ?? "", date) >= 3);

describe("every season's calendar, in every mode", () => {
  for (const [mode, formats] of Object.entries(MODES)) {
    it(`places every league's dates in ${mode}, off the FIFA windows for Série A with national football`, () => {
      for (const season of SEASONS)
        for (const isWorld of [false, true])
          for (const hasNationalFootball of [false, true]) {
            const continental = isWorld || formats.calendar === "unified" ? continentalDates(season, formats, isWorld && isClubWorldCupSeason(season)) : [];
            const gridRounds = formats.calendar === "unified" ? 46 : 0;
            const calendar = seasonCalendar(season, counts, continental, formats, gridRounds, hasNationalFootball);
            const reserved = [...calendar.stateChampionshipDates, ...calendar.copaDoBrasilRounds.flatMap((round) => round.dates)];
            const leagues = { ...calendar.leagueDates, ...(calendar.leagueGrid ? { grid: calendar.leagueGrid } : {}) };
            for (const [league, dates] of Object.entries(leagues)) {
              expect(dates, `${league} ${season}`).toHaveLength(league === "grid" ? gridRounds : counts[league as keyof typeof counts]);
              expect(dates.every((date) => date.startsWith(`${season}-`))).toBe(true);
              expect(isAscendingApart(dates), `${league} ${season}`).toBe(true);
              expect(dates.filter((date) => reserved.some((other) => days(date, other) < 3)), `${league} ${season}`).toEqual([]);
            }
            const nextToContinental = (dates: readonly IsoDate[]) => dates.filter((date) => continental.some((other) => days(date, other) < 2));
            expect(nextToContinental(calendar.leagueDates.B), `${season}`).toEqual([]);
            // A season with the World Cup pause can't hold 38 rounds clear of the continental days around it (2026
            // with the world holds 35 at most), so it sits up to three rounds next to one; the games of the clubs
            // that play both move, so no club plays on consecutive days (below).
            if (isPausedForWorldCup(season, hasNationalFootball, formats)) {
              expect(nextToContinental(calendar.leagueDates.A).length, `${season}`).toBeLessThanOrEqual(3);
              expect(calendar.leagueDates.A.filter((date) => continental.includes(date)), `${season}`).toEqual([]);
            }
            else expect(nextToContinental(calendar.leagueDates.A), `${season}`).toEqual([]);
            if (hasNationalFootball && formats.calendar === "real") expect(calendar.leagueDates.A.filter(isInFifaWindow), `${season}`).toEqual([]);
          }
    });
  }

  it("keeps a season that fits on its usual Sunday, Wednesday and Saturday rounds", () => {
    for (const season of SEASONS) for (const dates of Object.values(seasonCalendar(season, counts).leagueDates)) expect(dates.every((date) => [0, 3, 6].includes(new Date(date).getUTCDay()))).toBe(true);
  });

  it("gives up its usual rounds only for the date it lacks: one Thursday round in 2033 with national football and the Club World Cup", () => {
    const calendar = seasonCalendar(2033, counts, continentalDates(2033, REALISTA, true), REALISTA, 0, true);
    expect(calendar.leagueDates.A).toHaveLength(38);
    expect(calendar.leagueDates.A.filter((date) => ![0, 3, 6].includes(new Date(date).getUTCDay()))).toHaveLength(1);
  });

  it("with the World Cup pause, rests Série A from 1 Jun to 21 Jul 2026 as the CBF did", () => {
    const calendar = seasonCalendar(2026, counts, continentalDates(2026, REALISTA, false), REALISTA, 0, true, true);
    expect(calendar.leagueDates.A).toHaveLength(38);
    expect(calendar.leagueDates.A.filter((date) => date >= "2026-06-01" && date <= "2026-07-21")).toEqual([]);
  });

  it("with the World Cup pause, rests Série A through every World Cup and still places its 38 rounds", () => {
    for (const season of SEASONS) {
      const worldCup = worldCupOf(season);
      if (!worldCup) continue;
      const calendar = seasonCalendar(season, counts, continentalDates(season, REALISTA, false), REALISTA, 0, true, true);
      expect(calendar.leagueDates.A).toHaveLength(38);
      expect(calendar.leagueDates.A.filter((date) => date >= worldCup.from && date <= worldCup.until)).toEqual([]);
      expect(calendar.leagueDates.A.filter(isInFifaWindow)).toEqual([]);
    }
  });
});

/** Every club's two games on the same day or on consecutive days, as `club date/date`. */
function consecutiveGames(state: GameState): string[] {
  const games = new Map<string, IsoDate[]>();
  for (const f of state.fixtures) for (const id of [f.homeId, f.awayId]) games.set(id, [...(games.get(id) ?? []), f.date]);
  return [...games].flatMap(([clubId, dates]) => dates.toSorted(compareText).flatMap((date, i, sorted) => (i > 0 && days(sorted[i - 1] ?? "", date) < 2 ? [`${clubId} ${sorted[i - 1]}/${date}`] : [])));
}

describe("every club's games in a World Cup season with the world and national football", () => {
  const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
  const guests = loadGuests(2026);
  const nationalFootball = loadNationalFootball();
  for (const season of [2026, 2030]) {
    it(`never fall on consecutive days in ${season}, though Série A's rounds sit next to continental days`, () => {
      let state = loadNewGame(2, { coachClubId: "flamengo-rj", world, guests, nationalFootball, season });
      while (state.date < `${season}-12-31`) state = advanceDay(state, {}).state;
      expect(consecutiveGames(state)).toEqual([]);
    }, 180_000);
  }
});

describe("a new game in a later season", () => {
  const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
  const guests = loadGuests(2026);
  const nationalFootball = loadNationalFootball();
  const leaguesOf = (game: GameState) => Object.values(game.competitions).flatMap((c): LeagueCompetition[] => (c.kind === "league" ? [c] : []));

  it("with national football, rests Série A from 1 Jun to 21 Jul 2026 as the CBF did, and through the 2030 World Cup, still playing its 38 rounds", () => {
    const pauses = { 2026: { from: "2026-06-01", until: "2026-07-21" }, 2030: worldCupOf(2030) };
    for (const [season, pause] of Object.entries(pauses)) {
      const game = loadNewGame(1, { coachClubId: "flamengo-rj", world, guests, nationalFootball, season: Number(season) });
      expect(game.calendar.leagueDates.A).toHaveLength(38);
      expect(game.calendar.leagueDates.A.filter((date) => pause && date >= pause.from && date <= pause.until), season).toEqual([]);
    }
  });

  for (const seed of [3, 7]) {
    it(`with the world and national football, places all 38 Série A rounds off the FIFA windows in 2033, a Club World Cup season (seed ${seed})`, () => {
      const game = loadNewGame(seed, { coachClubId: "flamengo-rj", world, guests, nationalFootball, season: 2033 });
      expect(game.calendar.leagueDates.A).toHaveLength(38);
      expect(game.calendar.leagueDates.A.filter(isInFifaWindow)).toEqual([]);
      for (const league of leaguesOf(game)) expect(league.stageDates.flat().every((date) => date.startsWith("2033-"))).toBe(true);
    });

    for (const [mode, formats] of Object.entries(MODES)) {
      it(`gives every league all its dates for 15 seasons in ${mode}, Brazil alone or with the world, with national football or without (seed ${seed})`, () => {
        for (const season of SEASONS.slice(0, 15))
          for (const isWorld of [false, true])
            for (const hasNationalFootball of [false, true]) {
              const game = loadNewGame(seed, { coachClubId: "flamengo-rj", season, formats, ...(hasNationalFootball ? { nationalFootball } : {}), ...(isWorld ? { world, guests } : {}) });
              for (const league of leaguesOf(game)) {
                const dates = league.stageDates.flat();
                const expected = LEAGUE_FORMATS[league.format].stageDateCounts(league.clubIds.length, league.legs ?? 2).reduce((sum, n) => sum + n, 0);
                expect(dates, `${league.id}`).toHaveLength(expected);
                expect(dates.every((date) => date.startsWith(`${season}-`)), `${league.id}`).toBe(true);
              }
            }
      }, 120_000);
    }
  }
});
