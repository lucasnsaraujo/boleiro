import { describe, expect, it } from "vitest";
import { leaguePhaseMatches } from "./continental/uefaCups.js";
import { RAPIDO, REALISTA, type Formats } from "./formats.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadEurope } from "./world/loadEurope.js";
import { loadSouthAmerica } from "./world/loadSouthAmerica.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
const gameIn = (formats: Formats) => loadNewGame(3, { coachClubId: "palmeiras-sp", world, formats });

const stageLegs = (game: GameState, competitionId: string) => game.competitions[competitionId]?.stageDates.map((dates) => dates.length);
const gamesPerClub = (game: GameState, cup: number) => {
  const matches = leaguePhaseMatches(game.europe?.cups[cup] ?? never());
  const counts = new Map<string, number>();
  for (const { homeId, awayId } of matches) for (const id of [homeId, awayId]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Set(counts.values());
};
function never(): never {
  throw new Error("no European cups");
}

describe("Rápido's formats", () => {
  const rapido = gameIn(RAPIDO);

  it("play the Libertadores' groups of four once each, three match days", () => {
    const groups = rapido.competitions["libertadores-2026"]?.stageDates[3];
    expect(groups).toHaveLength(3);
    expect(rapido.calendar.copaDoBrasilRounds.map((round) => round.dates.length)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 1]);
  });

  it("make every knockout tie one match but the quarter- and semi-finals", () => {
    expect(stageLegs(rapido, "libertadores-2026")).toEqual([1, 1, 1, 3, 1, 2, 2, 1]);
    expect(stageLegs(rapido, "sul-americana-2026")).toEqual([1, 3, 1, 1, 2, 2, 1]);
  });

  it("put UEFA's clubs in groups of four, three games each, instead of the league phase", () => {
    expect(gamesPerClub(rapido, 0)).toEqual(new Set([3]));
    expect(gamesPerClub(rapido, 1)).toEqual(new Set([3]));
    expect(rapido.europe?.cups[0]?.dates).toHaveLength(3);
  });

  it("keep both legs of every league", () => {
    expect(rapido.calendar.leagueDates.A).toHaveLength(38);
    expect(rapido.world?.["gb-eng"]?.leagues[0]?.dates).toHaveLength(38);
  });
});

describe("custom formats", () => {
  it("play a single round robin in every league when the leagues meet once", () => {
    const game = gameIn({ ...REALISTA, leagueLegs: 1 });
    expect(game.calendar.leagueDates.A).toHaveLength(19);
    expect(game.world?.["gb-eng"]?.leagues[0]?.dates).toHaveLength(19);
    expect(game.world?.["ar"]?.leagues[0]?.legs).toBe(1);
  });

  it("play six-game groups in UEFA's cups and single-match knockouts everywhere", () => {
    const game = gameIn({ ...RAPIDO, continentalGroups: "groups-6", knockouts: "single" });
    expect(gamesPerClub(game, 0)).toEqual(new Set([6]));
    expect(stageLegs(game, "libertadores-2026")).toEqual([1, 1, 1, 6, 1, 1, 1, 1]);
    expect(game.calendar.copaDoBrasilRounds.every((round) => round.dates.length === 1)).toBe(true);
  });

  it("keep UEFA's league phase on the unified calendar, eight days on the Libertadores' weeks", () => {
    const game = gameIn({ ...RAPIDO, continentalGroups: "league-phase" });
    expect(gamesPerClub(game, 0)).toEqual(new Set([8]));
    const libertadoresGroups = game.competitions["libertadores-2026"]?.stageDates[3] ?? [];
    expect(libertadoresGroups).toHaveLength(6);
    for (const date of libertadoresGroups) expect(game.europe?.cups[0]?.dates).toContain(date);
  });
});
