import { describe, expect, it } from "vitest";
import type { Division } from "@boleiro/data/players";
import { advanceDay, type DayEvent } from "./advanceDay.js";
import { cpuBudgetSeconds } from "./cpuBudgetSeconds.js";
import { eventMemoryOf } from "./events/eventMemory.js";
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
  const competition = Object.values(state.competitions).find((c) => c.kind === "league" && c.division === division);
  if (competition?.kind !== "league") throw new Error(`no Série ${division}`);
  return competition;
};

const fixturesOf = (state: GameState, division: Division) =>
  state.fixtures.filter((f) => f.competitionId === leagueOf(state, division).id);

const membersOf = (state: GameState, division: Division) =>
  Object.values(state.clubs).filter((club) => club.division === division).map((club) => club.id);

describe("a full season", () => {
  // CPU time, not wall time: other test files run in parallel processes and would inflate a wall clock.
  const started = process.cpuUsage();
  const lastDay = playUntil(loadNewGame(4, { coachClubId: null }), "2026-12-31");
  const { state: next, events } = playUntil(lastDay.state, "2027-01-01");
  const used = process.cpuUsage(started);
  const seconds = (used.user + used.system) / 1e6;
  // Five seconds on the machine the budget was set on; a slower machine gets as much longer as it is slower.
  const budget = cpuBudgetSeconds(5);
  const before = lastDay.state;
  const outcomes = events.find((e) => e.type === "seasonEnded");

  it("cools the rivalries' heat by half at the turn of the year", () => {
    const heated: GameState = { ...lastDay.state, eventMemory: { ...eventMemoryOf(lastDay.state), rivalry: { "flamengo-rj|fluminense-rj": 38, "palmeiras-sp|santos-sp": 1 } } };
    const turned = playUntil(heated, "2027-01-01").state;
    expect(eventMemoryOf(turned).rivalry["flamengo-rj|fluminense-rj"]).toBe(19);
    expect(eventMemoryOf(turned).rivalry["palmeiras-sp|santos-sp"]).toBeUndefined();
  });

  it("runs in a few seconds", () => {
    expect(seconds, `budget ${budget.toFixed(2)} s on this machine`).toBeLessThan(budget);
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

  it("drops Série D clubs knocked out before the last 32 out of the national leagues, unless their estadual sends them back", () => {
    const league = leagueOf(before, "D");
    const lastThirtyTwo = league.stages[2];
    const survivors = new Set(lastThirtyTwo?.kind === "knockout" ? lastThirtyTwo.ties.flat() : []);
    const eliminated = league.clubIds.filter((id) => !survivors.has(id));
    expect(eliminated).toHaveLength(64);
    expect(eliminated.filter((id) => next.clubs[id]?.division !== null && next.clubs[id]?.division !== "D")).toEqual([]);
    expect(eliminated.filter((id) => next.clubs[id]?.division === null).length).toBeGreaterThan(0);
  });

  it("never pairs two clubs from the same Série D group in the first knockout round", () => {
    const league = leagueOf(before, "D");
    const [groupStage, firstKnockout] = league.stages;
    const groupOf = new Map(groupStage?.kind === "groups" ? groupStage.groups.flatMap((g, i) => g.map((id) => [id, i])) : []);
    const ties = firstKnockout?.kind === "knockout" ? firstKnockout.ties : [];
    expect(ties).toHaveLength(32);
    expect(ties.filter(([a, b]) => groupOf.get(a) === groupOf.get(b))).toEqual([]);
  });

  it("reports each league's champion, promotions and relegations", () => {
    expect(outcomes?.type === "seasonEnded" && Object.values(outcomes.outcomes).map((o) => o.relegatedIds.length)).toEqual([4, 4, 2, 64]);
  });

  it("ages players, retires veterans and brings in youth players for the next season", () => {
    const flamengo = (state: GameState) => Object.values(state.players).filter((p) => p.clubId === "flamengo-rj");
    const stayed = flamengo(before).filter((p) => next.players[p.id]);
    expect(stayed.every((p) => next.players[p.id]?.age === p.age + 1)).toBe(true);
    expect(events.filter((e) => e.type === "playerRetired").length).toBeGreaterThan(100);
    expect(events.filter((e) => e.type === "youthPromoted").length).toBeGreaterThan(100);
    expect(flamengo(before).some((p) => p.condition.seasonMinutes > 0)).toBe(true);
  });

  it("has organised supporters press often, protest less and turn violent rarely", () => {
    const count = (type: DayEvent["type"]) => lastDay.events.filter((e) => e.type === type).length;
    const clubs = Object.keys(before.clubs).length;
    expect(count("fansPressure")).toBeGreaterThan(count("fansProtest"));
    expect(count("fansProtest")).toBeGreaterThan(count("fansViolence"));
    expect(count("fansProtest")).toBeGreaterThan(0);
    expect(count("fansViolence")).toBeLessThan(clubs / 15);
  });

  it("files the Brasileirão's awards and the Ballon d'Or, and starts the season's ratings over", () => {
    const filed = next.history.seasons.at(-1);
    const awards = filed?.awards;
    expect(awards?.bolaDePrata).toHaveLength(11);
    expect(awards?.bolaDeOuro?.average).toBeGreaterThan(6.5);
    expect(awards?.bolaDeOuro?.apps).toBeGreaterThanOrEqual(19);
    expect(awards?.topScorer?.goals).toBe(filed?.topScorers["serie-a"]?.goals);
    expect(awards?.ballonDor).toHaveLength(3);
    expect(next.history.current.ratings).toEqual({});
  });

  it("starts the next season with a fresh calendar", () => {
    expect(next.season).toBe(2027);
    expect(next.fixtures.every((f) => f.date.startsWith("2027-") && !f.result)).toBe(true);
    expect(fixturesOf(next, "C")).toHaveLength(23 * 12);
  });
});
