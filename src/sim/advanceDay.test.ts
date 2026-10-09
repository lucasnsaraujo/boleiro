import { describe, expect, it } from "vitest";
import { simulateMatch } from "../engine/match.js";
import { paramsForDivision } from "../engine/paramsForDivision.js";
import { randomStream } from "../engine/random.js";
import { advanceDay } from "./advanceDay.js";
import { CARD_RATES } from "./discipline/cardRates.js";
import { countCards, drawCards, sendOffMinutes } from "./discipline/drawCards.js";
import type { Fixture, GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { isInjured } from "./players/isInjured.js";
import { pickMatchLineup } from "./players/pickMatchLineup.js";

const start = loadNewGame(11, { coachClubId: "flamengo-rj" });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

describe("advanceDay", () => {
  it("plays only the fixtures dated today and moves to the next day", () => {
    const firstDate = start.calendar.leagueDates.A[0] ?? "";
    const before = advanceTo(start, firstDate);
    const { state, events } = advanceDay(before, {});
    const today = before.fixtures.filter((f) => f.date === firstDate);
    expect(events.filter((e) => e.type === "matchPlayed")).toHaveLength(today.length);
    const playedBefore = new Set(before.fixtures.filter((f) => f.result).map((f) => f.id));
    expect(state.fixtures.filter((f) => f.result && !playedBefore.has(f.id)).map((f) => f.id)).toEqual(today.map((f) => f.id));
    expect(state.date > before.date).toBe(true);
  });

  it("does not change the state it is given", () => {
    const before = advanceTo(start, start.calendar.leagueDates.A[0] ?? "");
    const snapshot = JSON.stringify(before);
    advanceDay(before, {});
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it.each(["B", "D"] as const)("plays Série %s games with that division's engine params", (division) => {
    const reached = advanceTo(start, start.calendar.leagueDates[division][0] ?? "");
    const isOtherLeagueToday = (f: Fixture) => {
      const competition = reached.competitions[f.competitionId];
      return f.date === reached.date && !(competition?.kind === "league" && competition.division === division);
    };
    // Fresh players and moods, so the engine sees each player's plain strength.
    const before = { ...reached, players: start.players, mood: start.mood, fixtures: reached.fixtures.filter((f) => !isOtherLeagueToday(f)) };
    const first = before.fixtures.find((f) => f.date === before.date);
    if (!first) throw new Error(`no Série ${division} game today`);
    const squad = (clubId: string) => Object.values(before.players).filter((p) => p.clubId === clubId);
    const team = (clubId: string) => ({ name: clubId, players: squad(clubId) });
    const context = { date: before.date, pitch: before.clubs[first.homeId]?.pitch ?? "natural" };
    const random = randomStream(before.rngState).next;
    const bookings = drawCards(pickMatchLineup(squad(first.homeId), context), pickMatchLineup(squad(first.awayId), context), CARD_RATES[division], random);
    const goals = simulateMatch(team(first.homeId), team(first.awayId), random, paramsForDivision(division), sendOffMinutes(bookings, first.homeId));
    const expected = { ...goals, cards: countCards(bookings, first.homeId) };
    const played = advanceDay(before, {}).state.fixtures.find((f) => f.id === first.id);
    expect(played?.result).toEqual(expected);
  });

  it.each([
    ["fewer than eleven players", (ids: string[]) => ids.slice(0, 1)],
    ["the same player twice", (ids: string[]) => [...ids.slice(0, 10), ids[1] ?? ""]],
    ["no goalkeeper", (ids: string[]) => ids.slice(1, 12)],
  ])("refuses a coach lineup with %s", (_, shape) => {
    const before = advanceTo(start, start.calendar.leagueDates.A[0] ?? "");
    const squad = Object.values(before.players).filter((p) => p.clubId === "flamengo-rj" && !isInjured(p, before.date));
    const keeper = squad.filter((p) => p.group === "GK").slice(0, 1);
    const ordered = [...keeper, ...squad.filter((p) => p.group !== "GK")].map((p) => p.id);
    expect(() => advanceDay(before, { lineup: ordered.slice(0, 11) })).not.toThrow();
    expect(() => advanceDay(before, { lineup: shape(ordered) })).toThrow();
  });

  it("refuses a coach lineup with players from another club", () => {
    const before = advanceTo(start, start.calendar.leagueDates.A[0] ?? "");
    const outsider = Object.values(before.players).find((p) => p.clubId !== "flamengo-rj");
    expect(() => advanceDay(before, { lineup: [outsider?.id ?? ""] })).toThrow();
  });

  it("plays the coach's chosen lineup instead of the automatic one", () => {
    const firstDate = start.calendar.leagueDates.A[0] ?? "";
    const before = advanceTo(start, firstDate);
    const squad = Object.values(before.players).filter((p) => p.clubId === "flamengo-rj");
    const byStrength = [...squad].sort((a, b) => a.strength - b.strength);
    const weakestKeeper = byStrength.filter((p) => p.group === "GK").slice(0, 1);
    const weakest = [...weakestKeeper, ...byStrength.filter((p) => p.group !== "GK").slice(0, 10)].map((p) => p.id);
    const goalDifference = (lineup: string[] | undefined) =>
      Array.from({ length: 40 }, (_, seed) => {
        const { state } = advanceDay({ ...before, rngState: seed }, lineup ? { lineup } : {});
        const game = state.fixtures.find((f) => f.date === firstDate && [f.homeId, f.awayId].includes("flamengo-rj"));
        const diff = (game?.result?.homeGoals ?? 0) - (game?.result?.awayGoals ?? 0);
        return game?.homeId === "flamengo-rj" ? diff : -diff;
      }).reduce((sum, d) => sum + d, 0);
    expect(goalDifference(weakest)).toBeLessThan(goalDifference(undefined));
  });
});
