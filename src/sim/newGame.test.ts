import { describe, expect, it } from "vitest";
import type { Fixture, GameState } from "./gameState.js";
import { loadPlayers } from "../data/players.js";
import { loadNewGame } from "./loadNewGame.js";

const league = (state: GameState, division: string) => {
  const competition = Object.values(state.competitions).find((c) => c.division === division);
  if (!competition) throw new Error(`no Série ${division}`);
  return { competition, fixtures: state.fixtures.filter((f) => f.competitionId === competition.id) };
};

const gamesPerClub = (fixtures: Fixture[]) => {
  const games = new Map<string, number>();
  for (const f of fixtures) for (const id of [f.homeId, f.awayId]) games.set(id, (games.get(id) ?? 0) + 1);
  return new Set(games.values());
};

describe("newGame", () => {
  const state = loadNewGame(2026, { coachClubId: "flamengo-rj" });

  it("starts on 1 January of the first season with a Série A–D league each", () => {
    expect(state.date).toBe("2026-01-01");
    expect(Object.values(state.competitions).map((c) => [c.division, c.clubIds.length])).toEqual([
      ["A", 20], ["B", 20], ["C", 20], ["D", 96],
    ]);
  });

  it("schedules Série A and B as 38 rounds where every pair meets home and away", () => {
    for (const division of ["A", "B"]) {
      const { fixtures } = league(state, division);
      expect(fixtures).toHaveLength(380);
      expect(new Set(fixtures.map((f) => f.date)).size).toBe(38);
      expect(new Set(fixtures.map((f) => `${f.homeId}>${f.awayId}`)).size).toBe(380);
      expect(gamesPerClub(fixtures)).toEqual(new Set([38]));
    }
  });

  it("opens Série C with a 19-round single round robin", () => {
    const { fixtures } = league(state, "C");
    expect(fixtures).toHaveLength(190);
    expect(new Set(fixtures.map((f) => f.date)).size).toBe(19);
    expect(gamesPerClub(fixtures)).toEqual(new Set([19]));
  });

  it("opens Série D with 16 groups of six over 10 rounds", () => {
    const { competition, fixtures } = league(state, "D");
    const [groupStage] = competition.stages;
    expect(groupStage?.kind === "groups" && groupStage.groups.map((g) => g.length)).toEqual(Array(16).fill(6));
    expect(fixtures).toHaveLength(16 * 30);
    expect(new Set(fixtures.map((f) => f.date)).size).toBe(10);
    expect(gamesPerClub(fixtures)).toEqual(new Set([10]));
  });

  it("never schedules a club twice on one day", () => {
    const seen = new Set<string>();
    for (const f of state.fixtures) {
      for (const id of [f.homeId, f.awayId]) {
        expect(seen.has(`${f.date}:${id}`)).toBe(false);
        seen.add(`${f.date}:${id}`);
      }
    }
  });

  it("keeps every player from the data with a unique id and a known club", () => {
    const players = Object.values(state.players);
    expect(players).toHaveLength(loadPlayers().length);
    expect(players.every((p) => state.players[p.id] === p && state.clubs[p.clubId])).toBe(true);
  });

  it("depends only on the seed", () => {
    expect(loadNewGame(2026, { coachClubId: "flamengo-rj" })).toEqual(state);
    expect(loadNewGame(7, { coachClubId: "flamengo-rj" }).fixtures).not.toEqual(state.fixtures);
  });
});
