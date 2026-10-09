import { describe, expect, it } from "vitest";
import { simulateMatch } from "../engine/match.js";
import { paramsForDivision } from "../engine/paramsForDivision.js";
import { randomStream } from "../engine/random.js";
import { advanceDay } from "./advanceDay.js";
import type { Fixture, GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";

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
    const before = { ...reached, fixtures: reached.fixtures.filter((f) => !isOtherLeagueToday(f)) };
    const first = before.fixtures.find((f) => f.date === before.date);
    const team = (clubId: string) => ({ name: clubId, players: Object.values(before.players).filter((p) => p.clubId === clubId) });
    const expected = simulateMatch(team(first?.homeId ?? ""), team(first?.awayId ?? ""), randomStream(before.rngState).next, paramsForDivision(division));
    const played = advanceDay(before, {}).state.fixtures.find((f) => f.id === first?.id);
    expect(played?.result).toEqual(expected);
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
    const weakest = [...squad].sort((a, b) => a.strength - b.strength).slice(0, 11).map((p) => p.id);
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
