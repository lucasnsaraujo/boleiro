import { describe, expect, it } from "vitest";
import { loadClubs } from "./clubs.js";
import { loadPlayers, loadTeams } from "./players.js";

describe("loadPlayers", () => {
  it("links every player to a club in clubs.csv", () => {
    const clubIds = new Set(loadClubs().map((club) => club.id));
    const players = loadPlayers();
    expect(players.length).toBeGreaterThan(0);
    expect(players.filter((player) => !clubIds.has(player.clubId))).toEqual([]);
  });
});

describe("loadTeams", () => {
  it("builds the twenty Série A squads", () => {
    const teams = loadTeams("A");
    expect(teams).toHaveLength(20);
    expect(teams.every((team) => team.players.length >= 18)).toBe(true);
  });
});
