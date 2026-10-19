import { describe, expect, it } from "vitest";
import { loadDivisions, loadResults, type HistoricalMatch } from "./history.js";

const COMPLETED_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const SERIE_C_SEASONS = COMPLETED_SEASONS.filter((season) => season >= 2017);

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

  it("has Série C seasons the size of their group-plus-knockout format", () => {
    const counts = perSeason(loadResults("serie-c"));
    for (const season of SERIE_C_SEASONS) {
      expect(counts.get(season), String(season)).toBeGreaterThanOrEqual(180);
      expect(counts.get(season), String(season)).toBeLessThanOrEqual(240);
    }
  });

  it("has the 2024 Série D season", () => {
    const counts = perSeason(loadResults("serie-d"));
    expect(counts.get(2024)).toBeGreaterThanOrEqual(450);
    expect(counts.get(2024)).toBeLessThanOrEqual(560);
  });

  it("takes each season from a single source", () => {
    for (const season of COMPLETED_SEASONS) {
      const sources = new Set(cup.filter((m) => m.season === season).map((m) => m.source));
      expect(sources.size, String(season)).toBe(1);
    }
    expect(cup.find((m) => m.season === 2024)?.source).toBe("sofascore");
  });

  it("only records a shootout winner when the tie ended level over one or two legs", () => {
    const shootouts = cup.filter((match) => match.penaltyWinner !== null);
    expect(shootouts.length).toBeGreaterThan(50);
    const unlevel = shootouts.filter((match) => {
      const firstLeg = cup.find(
        (leg) => leg.season === match.season && leg.date < match.date && leg.home.ref === match.away.ref && leg.away.ref === match.home.ref,
      );
      return match.homeGoals + (firstLeg?.awayGoals ?? 0) !== match.awayGoals + (firstLeg?.homeGoals ?? 0);
    });
    // ESPN has three ties (2016, 2017, 2020) whose scores and shootout disagree; see data/SOURCES.md.
    expect(unlevel.length / shootouts.length).toBeLessThanOrEqual(0.02);
  });

  it("stores 2024 cup closing odds as decimal prices with a normal bookmaker margin", () => {
    const season = cup.filter((match) => match.season === 2024);
    const priced = season.filter((match) => match.odds !== null);
    expect(priced.length / season.length).toBeGreaterThan(0.9);
    for (const { odds } of priced) {
      if (!odds) continue;
      const overround = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
      expect(overround).toBeGreaterThan(1);
      expect(overround).toBeLessThan(1.25);
    }
  });

  it("knows each team's division per season, so cup ties can be labelled", () => {
    expect(divisions.get(2024)?.get("sofascore:5981")).toBe("A");
    for (const season of COMPLETED_SEASONS) {
      const teams = [...(divisions.get(season)?.values() ?? [])];
      expect(teams.filter((d) => d === "A").length, String(season)).toBeGreaterThanOrEqual(20);
      expect(teams.filter((d) => d === "B").length, String(season)).toBeGreaterThanOrEqual(20);
    }
    const labelled = cup.filter((m) => divisions.get(m.season)?.has(m.home.ref) || divisions.get(m.season)?.has(m.away.ref));
    expect(labelled.length / cup.length).toBeGreaterThan(0.6);
  });

  it("gives the same club the same team key in both sources", () => {
    const keysIn = (season: number) => new Set(cup.filter((m) => m.season === season).flatMap((m) => [m.home.key, m.away.key]));
    const espn2023 = keysIn(2023);
    const sofascore2024 = keysIn(2024);
    for (const club of ["flamengo", "palmeiras", "corinthians", "gremio", "sao-paulo"]) {
      expect(espn2023.has(club), `espn ${club}`).toBe(true);
      expect(sofascore2024.has(club), `sofascore ${club}`).toBe(true);
    }
  });
});
