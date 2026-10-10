import { describe, expect, test } from "vitest";
import type { Competition, CupCompetition, Fixture, GameState, LeagueCompetition, MatchResult } from "../../src/sim/gameState.js";
import { newGameFromFiles } from "../../src/sim/loadNewGame.js";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { bracketRounds, coachCompetitions, defaultStage, groupTables, knockoutTies, topScorers, type TableRow } from "./competitionTables.js";

const game = newGameFromFiles(7, { coachClubId: "bahia-ba" }, bundledGameFiles);

function competition(id: string): Competition {
  const found = game.competitions[id];
  if (!found) throw new Error(`no competition ${id}`);
  return found;
}

const zonesByPosition = (rows: readonly TableRow[]) => rows.map((row) => row.zone);
const repeat = <T>(value: T, times: number): T[] => Array.from({ length: times }, () => value);

describe("coachCompetitions", () => {
  test("are the state championship, the league and the cup the coach's club plays this season", () => {
    expect(coachCompetitions(game).map((c) => c.id)).toEqual(["state-ba-2026", "serie-a-2026", "copa-do-brasil-2026"]);
  });

  test("a coach without a club sees the Série A and the Copa do Brasil", () => {
    expect(coachCompetitions({ ...game, coachClubId: null }).map((c) => c.id)).toEqual(["serie-a-2026", "copa-do-brasil-2026"]);
  });
});

describe("groupTables zones", () => {
  test("Série A: four to the Libertadores, one to its preliminary phase, six to the Sul-Americana, four relegated", () => {
    const { groups, zones } = groupTables(competition("serie-a-2026"), 0, game.fixtures);
    expect(groups).toHaveLength(1);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([
      ...repeat("libertadores", 4),
      "preLibertadores",
      ...repeat("sulAmericana", 6),
      ...repeat(null, 5),
      ...repeat("relegation", 4),
    ]);
    expect(zones.map((z) => z.label)).toEqual(["Libertadores", "Pré-Libertadores", "Sul-Americana", "Rebaixamento"]);
  });

  test("Série B: four promoted and four relegated", () => {
    const { groups } = groupTables(competition("serie-b-2026"), 0, game.fixtures);
    expect(zonesByPosition(groups[0]?.rows ?? [])).toEqual([...repeat("promotion", 4), ...repeat(null, 12), ...repeat("relegation", 4)]);
  });

  test("Série C first phase: eight to the quadrangulars, two relegated in 2026", () => {
    const { groups } = groupTables(competition("serie-c-2026"), 0, game.fixtures);
    const rows = groups[0]?.rows ?? [];
    expect(zonesByPosition(rows)).toEqual([...repeat("advance", 8), ...repeat(null, rows.length - 10), ...repeat("relegation", 2)]);
  });

  test("Série D groups: the top four of each group of six go through, the last two drop out", () => {
    const { groups } = groupTables(competition("serie-d-2026"), 0, game.fixtures);
    expect(groups).toHaveLength(16);
    expect(groups[0]?.label).toBe("Grupo A");
    for (const group of groups) expect(zonesByPosition(group.rows)).toEqual([...repeat("advance", 4), ...repeat("relegation", 2)]);
  });

  test("a state championship marks the clubs that would reach the knockout, ranked across the groups", () => {
    const { groups, zones } = groupTables(competition("state-ba-2026"), 0, game.fixtures);
    expect(groups.map((g) => g.label)).toEqual(["Grupo A", "Grupo B"]);
    // Ten clubs send four to the knockout: with two groups, the top two of each.
    for (const group of groups) expect(zonesByPosition(group.rows)).toEqual(["advance", "advance", null, null, null]);
    expect(zones.map((z) => z.label)).toEqual(["Mata-mata"]);
  });

  test("rows follow the standings once games are played", () => {
    const league = competition("serie-a-2026");
    const [first] = game.fixtures.filter((f) => f.competitionId === league.id);
    if (!first) throw new Error("no Série A fixture");
    const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === first.id ? { ...f, result: { homeGoals: 3, awayGoals: 0 } } : f));
    const rows = groupTables(league, 0, fixtures).groups[0]?.rows ?? [];
    expect(rows[0]).toMatchObject({ clubId: first.homeId, position: 1, points: 3, goalDifference: 3, played: 1 });
    expect(rows.at(-1)).toMatchObject({ clubId: first.awayId, position: 20, zone: "relegation" });
  });
});

describe("knockout ties and the cup bracket", () => {
  const cup: CupCompetition = {
    id: "copa-do-brasil-2026",
    kind: "cup",
    season: 2026,
    clubIds: ["a", "b", "c", "d"],
    entries: [["a", "b", "c", "d"]],
    stages: [{ kind: "knockout", ties: [["a", "b"], ["c", "d"]], dates: ["2026-08-02", "2026-08-08"] }],
    stageDates: [["2026-08-02", "2026-08-08"], ["2026-12-06"]],
    drawOrder: ["a", "b", "c", "d"],
  };
  const leg = (id: string, tie: number, date: string, homeId: string, awayId: string, result: MatchResult | null): Fixture => ({
    id, competitionId: cup.id, stage: 0, tie, date, homeId, awayId, result,
  });
  const fixtures: Fixture[] = [
    leg("a1", 0, "2026-08-02", "b", "a", { homeGoals: 2, awayGoals: 1 }),
    leg("a2", 0, "2026-08-08", "a", "b", { homeGoals: 2, awayGoals: 0 }),
    leg("c1", 1, "2026-08-02", "d", "c", { homeGoals: 1, awayGoals: 0 }),
    leg("c2", 1, "2026-08-08", "c", "d", null),
  ];

  test("a two-legged tie adds both legs up and names the winner once it is over", () => {
    const [decided, open] = knockoutTies(cup, 0, fixtures);
    expect(decided).toMatchObject({ clubIds: ["a", "b"], aggregate: [3, 2], winnerId: "a", onPenalties: false });
    expect(decided?.legs.map((l) => [l.homeId, l.homeGoals, l.awayGoals, l.awayId])).toEqual([
      ["b", 2, 1, "a"],
      ["a", 2, 0, "b"],
    ]);
    expect(open).toMatchObject({ clubIds: ["c", "d"], aggregate: [0, 1], winnerId: null });
  });

  test("a level tie goes to the club that won the shootout", () => {
    const level = fixtures.map((f) => (f.id === "a2" ? { ...f, result: { homeGoals: 1, awayGoals: 0, penaltyWinnerId: "b" } } : f));
    expect(knockoutTies(cup, 0, level)[0]).toMatchObject({ aggregate: [2, 2], winnerId: "b", onPenalties: true });
  });

  test("a tie with no leg played has no aggregate", () => {
    expect(knockoutTies(cup, 0, fixtures.map((f) => ({ ...f, result: null })))[0]).toMatchObject({ aggregate: null, winnerId: null });
  });

  test("the Copa do Brasil bracket lists all nine rounds by name, with ties only where drawn", () => {
    const rounds = bracketRounds(competition("copa-do-brasil-2026"), game.calendar, game.fixtures);
    expect(rounds.map((r) => r.name)).toEqual(["1ª fase", "2ª fase", "3ª fase", "4ª fase", "5ª fase", "Oitavas", "Quartas", "Semifinal", "Final"]);
    expect(rounds[0]?.ties).toHaveLength(14);
    expect(rounds.slice(1).every((r) => r.ties === null)).toBe(true);
  });
});

describe("defaultStage", () => {
  test("is the latest drawn stage the coach's club is in", () => {
    const league = competition("serie-a-2026");
    if (league.kind !== "league") throw new Error("Série A is a league");
    const withKnockout: LeagueCompetition = { ...league, stages: [...league.stages, { kind: "knockout", ties: [["x", "y"]], dates: [] }] };
    expect(defaultStage(withKnockout, "bahia-ba")).toBe(0);
    expect(defaultStage(withKnockout, "x")).toBe(1);
  });

  test("is the latest drawn stage when the club is out or has no club", () => {
    expect(defaultStage(competition("copa-do-brasil-2026"), null)).toBe(0);
  });
});

describe("topScorers", () => {
  test("lists the competition's scorers this season, most goals first, with their current club", () => {
    const [first, second] = Object.values(game.players);
    if (!first || !second) throw new Error("no players");
    const history: GameState["history"] = {
      ...game.history,
      current: { ...game.history.current, goals: { "serie-a": { [first.id]: 2, [second.id]: 5 }, "serie-b": { [first.id]: 9 } } },
    };
    expect(topScorers(competition("serie-a-2026"), { history, players: game.players }, 10)).toEqual([
      { playerId: second.id, name: second.name, clubId: second.clubId, goals: 5 },
      { playerId: first.id, name: first.name, clubId: first.clubId, goals: 2 },
    ]);
  });
});
