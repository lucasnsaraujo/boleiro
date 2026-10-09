import { describe, expect, it } from "vitest";
import type { Division } from "../data/players.js";
import { advanceDay, type DayEvent } from "./advanceDay.js";
import type { GameState, LeagueCompetition } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { standings } from "./standings.js";

function playUntil(state: GameState, date: string): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, {});
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const leagueOf = (state: GameState, division: Division): LeagueCompetition => {
  const competition = Object.values(state.competitions).find((c) => c.division === division);
  if (!competition) throw new Error(`no Série ${division}`);
  return competition;
};

const fixturesOf = (state: GameState, division: Division) =>
  state.fixtures.filter((f) => f.competitionId === leagueOf(state, division).id);

const membersOf = (state: GameState, division: Division) =>
  Object.values(state.clubs).filter((club) => club.division === division).map((club) => club.id);

describe("a full season", () => {
  const started = performance.now();
  const lastDay = playUntil(loadNewGame(2026, { coachClubId: null }), "2026-12-31");
  const { state: next, events } = playUntil(lastDay.state, "2027-01-01");
  const elapsed = performance.now() - started;
  const before = lastDay.state;
  const outcomes = events.find((e) => e.type === "seasonEnded");

  it("runs in a few seconds", () => {
    expect(elapsed).toBeLessThan(5000);
  });

  it("plays every league fixture before the year ends", () => {
    expect(before.fixtures.every((f) => f.result)).toBe(true);
  });

  it("plays the right number of matches per league", () => {
    expect(fixturesOf(before, "A")).toHaveLength(380);
    expect(fixturesOf(before, "B")).toHaveLength(380);
    expect(fixturesOf(before, "C")).toHaveLength(190 + 2 * 12 + 2);
    expect(fixturesOf(before, "D")).toHaveLength(610);
  });

  it("never has a club play twice on one day", () => {
    const keys = before.fixtures.flatMap((f) => [`${f.date}:${f.homeId}`, `${f.date}:${f.awayId}`]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("relegates the bottom four of Série A and promotes the top four of Série B", () => {
    const table = (division: Division) => {
      const league = leagueOf(before, division);
      return standings(league.clubIds, fixturesOf(before, division), league.drawOrder).map((row) => row.clubId);
    };
    const nextA = membersOf(next, "A");
    expect(nextA).toHaveLength(20);
    expect(nextA).toEqual(expect.arrayContaining(table("B").slice(0, 4)));
    expect(nextA.filter((id) => table("A").slice(-4).includes(id))).toEqual([]);
    expect(membersOf(next, "B")).toEqual(expect.arrayContaining(table("A").slice(-4)));
    expect(membersOf(next, "C")).toEqual(expect.arrayContaining(table("B").slice(-4)));
  });

  it("promotes Série C's quadrangular top two and relegates its bottom two", () => {
    const league = leagueOf(before, "C");
    const quadrangulars = league.stages[1];
    const stageFixtures = fixturesOf(before, "C");
    const promoted = quadrangulars?.kind === "groups"
      ? quadrangulars.groups.flatMap((group) =>
          standings(group, stageFixtures.filter((f) => f.stage === 1), league.drawOrder).slice(0, 2).map((r) => r.clubId))
      : [];
    const firstPhase = standings(league.clubIds, stageFixtures.filter((f) => f.stage === 0), league.drawOrder).map((r) => r.clubId);
    expect(promoted).toHaveLength(4);
    expect(membersOf(next, "B")).toEqual(expect.arrayContaining(promoted));
    expect(firstPhase.slice(-2).map((id) => next.clubs[id]?.division)).toEqual(["D", "D"]);
  });

  it("promotes Série D's four semi-finalists and two playoff winners, growing Série C to 24", () => {
    const league = leagueOf(before, "D");
    const semiStage = league.stages[5];
    const semiFinalists = semiStage?.kind === "knockout" ? semiStage.ties.slice(0, 2).flat() : [];
    expect(semiFinalists).toHaveLength(4);
    expect(semiFinalists.map((id) => next.clubs[id]?.division)).toEqual(["C", "C", "C", "C"]);
    expect(membersOf(next, "C")).toHaveLength(24);
    expect(membersOf(next, "D")).toHaveLength(96);
  });

  it("reports each league's champion, promotions and relegations", () => {
    expect(outcomes?.type === "seasonEnded" && Object.values(outcomes.outcomes).map((o) => o.relegatedIds.length)).toEqual([4, 4, 2, 64]);
  });

  it("starts the next season with a fresh calendar", () => {
    expect(next.season).toBe(2027);
    expect(next.fixtures.every((f) => f.date.startsWith("2027-") && !f.result)).toBe(true);
    expect(fixturesOf(next, "C")).toHaveLength(23 * 12);
  });
});
