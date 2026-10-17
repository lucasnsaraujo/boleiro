import { describe, expect, it } from "vitest";
import { loadNationalFootball, parseNationalFootball } from "./nationalFootball.js";

describe("the national football packs", () => {
  const football = loadNationalFootball();

  it("give every national team its confederation, FIFA code and kit colours", () => {
    expect(football.teams).toHaveLength(90);
    const brazil = football.teams.find((team) => team.id === "brazil");
    expect(brazil).toEqual({ id: "brazil", name: "Brazil", confederation: "CONMEBOL", code: "BRA", colours: { primary: "#FFDC02", secondary: "#009C3B" } });
    expect(football.teams.every((team) => /^[A-Z]{3}$/.test(team.code))).toBe(true);
  });

  it("carry the FIFA ranking with its date and source", () => {
    expect(football.ranking.date).toBe("2026-10-07");
    expect(football.ranking.source).toContain("fotmob.com");
    expect(football.ranking.rows).toHaveLength(211);
    expect(football.ranking.rows.find((row) => row.teamId === "brazil")).toMatchObject({ rank: 6, points: 1807 });
  });

  it("carry the real 2026 World Cup groups and the Nations League A groups", () => {
    const worldCup = football.fixtures.filter((f) => f.competition === "world-cup-2026" && f.group);
    expect(worldCup).toHaveLength(72);
    expect(new Set(worldCup.flatMap((f) => [f.homeId, f.awayId])).size).toBe(48);
    const nationsLeague = football.fixtures.filter((f) => f.competition === "nations-league-a-2026");
    expect(nationsLeague).toHaveLength(48);
    const known = new Set(football.teams.map((team) => team.id));
    expect([...worldCup, ...nationsLeague].every((f) => known.has(f.homeId) && known.has(f.awayId))).toBe(true);
  });

  it("list each team's last real squad", () => {
    const brazil = football.squads.filter((p) => p.teamId === "brazil");
    expect(brazil.length).toBeGreaterThanOrEqual(23);
    expect(brazil.some((p) => p.role === "goleiro")).toBe(true);
  });

  it("refuse a squad player of a team the pack doesn't have", () => {
    const teams = JSON.stringify({ format: 1, packVersion: "t", teams: { id: ["brazil"], name: ["Brazil"], confederation: ["CONMEBOL"] }, players: { team: [3], id: ["tm-1"], name: ["X"], role: ["meia"], birthDate: [null], clubTransfermarktId: [null], clubName: [""], marketValueEur: [null], caps: [null], goals: [null] } });
    const pack = JSON.stringify({ format: 1, packVersion: "f", ranking: { date: "2026-10-07", source: "s", team: [], name: [], rank: [], points: [] }, teams: { id: ["brazil"], code: ["BRA"], primaryColour: ["#FFDC02"], secondaryColour: ["#009C3B"] }, fixtures: { source: {}, competition: [], round: [], group: [], date: [], home: [], away: [] } });
    expect(() => parseNationalFootball(teams, pack)).toThrow(/players.team/);
  });
});
