import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadShards, saveShards } from "../saveShards.js";
import { EUROPE } from "../world/europe.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { leaguePhaseMatches, superCupWinner } from "./uefaCups.js";

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

describe("a game with Europe", () => {
  const start = loadNewGame(3, { coachClubId: null, world: [...loadSouthAmerica(2026), ...loadEurope(2026)] });
  const september = playUntil(start, "2026-09-09");

  it("opens UEFA's cups next to the CONMEBOL ones", () => {
    expect(start.europe?.cups.map((cup) => cup.cup)).toEqual(["champions-league", "europa-league"]);
    expect(Object.values(start.competitions).some((c) => c.kind === "continental")).toBe(true);
  });

  it("plays the Super Cup in August and the first Champions League matchday in September", () => {
    expect(superCupWinner(september.europe?.superCup ?? null)).toMatch(/^tm-/);
    const [championsLeague] = september.europe?.cups ?? [];
    const played = championsLeague ? leaguePhaseMatches(championsLeague).filter((m) => m.result) : [];
    expect(played).toHaveLength(18);
    expect(played.every((m) => m.date === "2026-09-08")).toBe(true);
  });

  it("starts Europe's leagues in August, Norway's in April", () => {
    const englandFirst = september.world?.["gb-eng"]?.leagues[0];
    expect(englandFirst?.results.startsWith("--")).toBe(false);
    expect(start.world?.["gb-eng"]?.leagues[0]?.dates[0]).toBe("2026-08-15");
    expect(start.world?.no?.leagues[0]?.dates[0]).toBe("2026-04-05");
  });

  it("saves and loads its cups with the game and each country in its own shard", () => {
    const shards = saveShards(september);
    expect(Object.keys(shards)).toContain("country-gb-eng");
    expect(loadShards(shards).europe).toEqual(september.europe);
  });

  it("goes on as before from a save that has no Europe", () => {
    const world = Object.fromEntries(Object.entries(september.world ?? {}).filter(([id]) => !EUROPE.some((structure) => structure.id === id)));
    const withoutEurope: GameState = { ...september, world };
    delete withoutEurope.europe;
    const old = loadShards(saveShards(withoutEurope));
    const day = advanceDay(old, {}).state;
    expect(day.europe).toBeUndefined();
    expect(day.date).toBe("2026-09-10");
  });
});
