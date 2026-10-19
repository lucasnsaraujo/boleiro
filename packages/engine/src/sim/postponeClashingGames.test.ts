import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import { compareText } from "./compareText.js";
import { daysBetween } from "./dates.js";
import type { Fixture, GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { isInFifaWindow, worldCupOf } from "./nations/fifaCalendar.js";
import { loadGame, saveGame } from "./saveGame.js";
import { loadEurope } from "./world/loadEurope.js";
import { loadGuests } from "./world/loadGuests.js";
import { loadMarketLeagues } from "./world/loadMarketLeagues.js";
import { loadSouthAmerica } from "./world/loadSouthAmerica.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);
const nationalFootball = loadNationalFootball();
const SERIE_A = "serie-a-2026";

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

/** Each club's games, in date order. */
function gamesByClub(state: GameState): Map<string, Fixture[]> {
  const games = new Map<string, Fixture[]>();
  for (const fixture of state.fixtures) for (const id of [fixture.homeId, fixture.awayId]) games.set(id, [...(games.get(id) ?? []), fixture]);
  for (const list of games.values()) list.sort((a, b) => compareText(a.date, b.date));
  return games;
}

/** Every club's two games on the same day or on consecutive days, as `club date/date`. */
function consecutiveGames(state: GameState): string[] {
  return [...gamesByClub(state)].flatMap(([clubId, games]) =>
    games.flatMap((game, i) => {
      const before = games[i - 1];
      return before && daysBetween(before.date, game.date) < 2 ? [`${clubId} ${before.date}/${game.date}`] : [];
    }),
  );
}

describe("a club's league game next to its continental match in a World Cup season", () => {
  // 2026 pauses Série A for the World Cup, so three of its rounds sit next to the Libertadores' and Sul-Americana's group days.
  const start = loadNewGame(1, { coachClubId: "flamengo-rj", world, guests, nationalFootball });
  const groupsDrawn = playUntil(start, "2026-04-06");
  const postponed = groupsDrawn.fixtures.filter((f) => f.postponedFrom !== undefined);
  const league = groupsDrawn.competitions[SERIE_A];
  const roundDates = league?.stageDates[0] ?? [];

  it("is postponed, so no club plays on consecutive days", () => {
    expect(postponed.length).toBeGreaterThan(0);
    expect(consecutiveGames(groupsDrawn)).toEqual([]);
  });

  it("keeps the round on its day: only the games of clubs with a continental match next to it move", () => {
    const continentalDays = new Map<string, string[]>();
    for (const f of groupsDrawn.fixtures) {
      if (groupsDrawn.competitions[f.competitionId]?.kind !== "continental") continue;
      for (const id of [f.homeId, f.awayId]) continentalDays.set(id, [...(continentalDays.get(id) ?? []), f.date]);
    }
    for (const game of postponed) {
      const from = game.postponedFrom ?? "";
      expect(roundDates).toContain(from);
      const isNextToContinental = [game.homeId, game.awayId].some((id) => continentalDays.get(id)?.some((date) => Math.abs(daysBetween(date, from)) < 2));
      expect(isNextToContinental, game.id).toBe(true);
      expect(groupsDrawn.fixtures.some((f) => f.competitionId === SERIE_A && f.date === from && f.postponedFrom === undefined), from).toBe(true);
    }
  });

  it("moves each game to a later day before the league's last round, two clear days from both clubs' other games", () => {
    const games = gamesByClub(groupsDrawn);
    for (const game of postponed) {
      expect(game.date > (game.postponedFrom ?? ""), game.id).toBe(true);
      expect(game.date < (roundDates.at(-1) ?? ""), game.id).toBe(true);
      for (const id of [game.homeId, game.awayId]) {
        const others = (games.get(id) ?? []).filter((f) => f.id !== game.id);
        expect(others.filter((f) => Math.abs(daysBetween(f.date, game.date)) < 3).map((f) => f.id), `${game.id} ${id}`).toEqual([]);
      }
    }
  });

  it("never moves a Série A game into a FIFA window or the World Cup pause, when Série A rests", () => {
    const worldCup = worldCupOf(2026);
    const restDays = postponed.filter((f) => isInFifaWindow(f.date) || (worldCup !== null && f.date >= worldCup.from && f.date <= worldCup.until));
    expect(restDays.map((f) => `${f.id}@${f.date}`)).toEqual([]);
  });

  it("saves and loads with its postponed games", () => {
    expect(loadGame(saveGame(groupsDrawn))).toEqual(groupsDrawn);
  });

  it("plays a postponed game on its new day, after its round", () => {
    const game = postponed.toSorted((a, b) => compareText(a.date, b.date))[0];
    if (!game) throw new Error("no postponed game");
    let state = groupsDrawn;
    let playedOn: string | null = null;
    while (playedOn === null && state.date < "2026-12-31") {
      const today = state.date;
      state = advanceDay(state, {}).state;
      if (state.fixtures.find((f) => f.id === game.id)?.result) playedOn = today;
    }
    const played = state.fixtures.find((f) => f.id === game.id);
    expect(playedOn).toBe(played?.date);
    expect(played?.postponedFrom).toBe(game.postponedFrom);
    expect((playedOn ?? "") > (game.postponedFrom ?? "")).toBe(true);
  }, 120_000);
});

describe("a game without national football", () => {
  it("postpones nothing: its Série A rounds keep clear of the continental days", () => {
    const state = playUntil(loadNewGame(1, { coachClubId: "flamengo-rj", world, guests }), "2026-05-01");
    expect(state.fixtures.filter((f) => f.postponedFrom !== undefined)).toEqual([]);
  });
});

describe("a league abroad's game next to its club's cup match", () => {
  it("moves off the FIFA windows its rounds rest in", () => {
    // Arsenal's FA Cup ties land the day before or after Premier League rounds, and the November window starts on a Monday.
    const state = playUntil(loadNewGame(1, { coachClubId: "tm-11", world, guests, nationalFootball }), "2026-12-01");
    const abroad = state.fixtures.filter((f) => f.postponedFrom !== undefined && state.competitions[f.competitionId]?.kind === "league" && !f.competitionId.startsWith("serie-"));
    expect(abroad.length).toBeGreaterThan(0);
    expect(abroad.filter((f) => isInFifaWindow(f.date)).map((f) => `${f.id}@${f.date}`)).toEqual([]);
  }, 120_000);
});
