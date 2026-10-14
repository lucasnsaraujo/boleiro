import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { leagueMatches } from "./resultOnlyLeague.js";
import type { CountryStructure, WorldClub } from "./world.js";

const STRUCTURE: CountryStructure = {
  id: "yy",
  levels: [
    { name: "Primera", legs: 2, promoted: 0, relegated: 2 },
    { name: "Segunda", legs: 2, promoted: 2, relegated: 0 },
  ],
  window: ["03-01", "11-15"],
  continental: [{ entry: "libertadores", from: "league", places: 3 }],
};

const club = (id: string, strength: number): WorldClub => ({ id, name: id, positions: "GGDDDDDMMMMMAAA", strengths: Array.from({ length: 15 }, () => strength) });
const LEVELS = [0, 1].map((level) => Array.from({ length: 10 }, (_, i) => club(`yy-${level}-${i}`, 75 - 8 * level - i)));

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

describe("a game with a result-only country", () => {
  const plain = playUntil(loadNewGame(5, { coachClubId: "bahia-ba" }), "2027-01-02");
  const midSeason = playUntil(loadNewGame(5, { coachClubId: "bahia-ba", world: [{ structure: STRUCTURE, levels: LEVELS }] }), "2026-07-01");
  const withWorld = playUntil(midSeason, "2027-01-02");

  it("plays Brazil exactly as a game without it", () => {
    const { world, ...brazil } = withWorld;
    expect(world).toBeDefined();
    expect(brazil).toStrictEqual(plain);
  });

  it("plays the country's leagues day by day and rolls them over with the season", () => {
    const country = withWorld.world?.yy;
    const played = (state: GameState) => state.world?.yy?.leagues.flatMap(leagueMatches).filter((m) => m.result).length;
    expect(played(midSeason)).toBeGreaterThan(0);
    expect(played(midSeason)).toBeLessThan(180);
    expect(country?.seasons.map((s) => s.season)).toEqual([2026]);
    expect(country?.seasons[0]?.continental.libertadores).toHaveLength(3);
    expect(country?.leagues.map((league) => league.season)).toEqual([2027, 2027]);
  });

  it("saves and loads the country with the rest of the game", () => {
    expect(loadGame(saveGame(midSeason))).toStrictEqual(midSeason);
  });
});
