import { describe, expect, it } from "vitest";
import { loadDivisions, loadResults, type HistoricalMatch } from "./history.js";

const COMPLETED_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

function perSeason(matches: HistoricalMatch[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const match of matches) counts.set(match.season, (counts.get(match.season) ?? 0) + 1);
  return counts;
}

describe("historical results", () => {
  const cup = loadResults("copa-do-brasil");
  const divisions = loadDivisions();

  it("has about 120 Copa do Brasil matches in every completed season", () => {
    const counts = perSeason(cup);
    for (const season of COMPLETED_SEASONS) expect(counts.get(season), String(season)).toBeGreaterThanOrEqual(110);
    for (const season of COMPLETED_SEASONS) expect(counts.get(season), String(season)).toBeLessThanOrEqual(185);
  });

  it("has a full 380-game Série B season every completed year", () => {
    const counts = perSeason(loadResults("serie-b"));
    for (const season of COMPLETED_SEASONS) expect(counts.get(season), String(season)).toBe(380);
  });

  it("has Série C and D seasons the size of their group-plus-knockout formats", () => {
    const c = perSeason(loadResults("serie-c"));
    const d = perSeason(loadResults("serie-d"));
    for (const season of COMPLETED_SEASONS) {
      expect(c.get(season), `C ${season}`).toBeGreaterThanOrEqual(180);
      expect(c.get(season), `C ${season}`).toBeLessThanOrEqual(240);
      expect(d.get(season), `D ${season}`).toBeGreaterThanOrEqual(250);
      expect(d.get(season), `D ${season}`).toBeLessThanOrEqual(560);
    }
  });

  it("only records a shootout winner when the match ended level", () => {
    const shootouts = cup.filter((match) => match.penaltyWinner !== null);
    expect(shootouts.length).toBeGreaterThan(50);
    for (const match of shootouts) expect(match.homeGoals).toBe(match.awayGoals);
  });

  it("stores closing odds as decimal prices with a normal bookmaker margin", () => {
    const priced = cup.filter((match) => match.odds !== null);
    expect(priced.length / cup.length).toBeGreaterThan(0.8);
    for (const { odds } of priced) {
      if (!odds) continue;
      const overround = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
      expect(overround).toBeGreaterThan(1);
      expect(overround).toBeLessThan(1.25);
    }
  });

  it("knows each team's division per season, so cup ties can be labelled", () => {
    const season2024 = divisions.get(2024);
    expect(season2024?.get(5981)).toBe("A");
    for (const season of COMPLETED_SEASONS) {
      const teams = [...(divisions.get(season)?.values() ?? [])];
      expect(teams.filter((d) => d === "A"), String(season)).toHaveLength(20);
      expect(teams.filter((d) => d === "B"), String(season)).toHaveLength(20);
    }
    const labelled = cup.filter((m) => divisions.get(m.season)?.has(m.home.id) && divisions.get(m.season)?.has(m.away.id));
    expect(labelled.length / cup.length).toBeGreaterThan(0.6);
  });
});
