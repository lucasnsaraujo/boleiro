import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { clubsOfWorld, coachesByClub, withCoachWorld, type CoachWorld } from "./aiCoaches.js";

const coachesOf = (state: GameState): CoachWorld => {
  if (!state.coaches) throw new Error("the game has no AI coaches");
  return state.coaches;
};

describe("the AI coaches on day one", () => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj", world: loadSouthAmerica(2026) });
  const byClub = coachesByClub(coachesOf(game));

  it("gives every club of the game a named coach but the player's", () => {
    const unnamed = [...clubsOfWorld(game).keys()].filter((id) => id !== "flamengo-rj" && !byClub.get(id)?.name);
    expect(unnamed).toEqual([]);
    expect(byClub.has("flamengo-rj")).toBe(false);
  });

  it("puts each club's real coach from Transfermarkt in charge, in Brazil and in the result-only world", () => {
    expect(byClub.get("palmeiras-sp")).toMatchObject({ name: "Abel Ferreira", nationality: "Portugal", born: 1979, isReal: true });
    expect(byClub.get("palmeiras-sp")?.stints).toEqual([{ clubId: "palmeiras-sp", from: "2020-11-04", until: null, left: null }]);
    expect(byClub.get("tm-209")).toMatchObject({ name: "Leonardo Ponzio", nationality: "Argentina", isReal: true });
  });

  it("sends the real coach of the player's club to the free pool", () => {
    const jardim = Object.values(coachesOf(game).coaches).find((coach) => coach.name === "Leonardo Jardim");
    expect(jardim?.clubId).toBeNull();
    expect(jardim?.stints.at(-1)).toMatchObject({ clubId: "flamengo-rj", until: game.date, left: "replaced" });
  });

  it("invents a local coach where Transfermarkt lists none, and keeps some out of work", () => {
    const stateOnly = Object.values(game.clubs).find((club) => club.division === null && !byClub.get(club.id)?.isReal);
    const coach = stateOnly && byClub.get(stateOnly.id);
    expect(coach?.nationality).toBe("Brazil");
    expect(coach?.isReal).toBeUndefined();
    const pool = Object.values(coachesOf(game).coaches).filter((c) => c.clubId === null);
    expect(pool.length).toBeGreaterThan(10);
  });

  it("gives a save from before AI coaches the same coaches from its seed whenever it loads", () => {
    const old = JSON.parse(saveGame(game)) as Record<string, unknown>;
    delete old.coaches;
    const first = withCoachWorld(loadGame(JSON.stringify(old)));
    const again = withCoachWorld(loadGame(JSON.stringify(old)));
    expect(first.coaches).toEqual(game.coaches);
    expect(again.coaches).toEqual(first.coaches);
  });
});

describe("the AI coaches and the rest of the game", () => {
  it("leave the matches, the money and the main random stream exactly as they were", () => {
    const withCoaches = loadNewGame(11, { coachClubId: "bahia-ba" });
    const without: GameState = { ...withCoaches };
    delete without.coaches;
    let a = withCoaches;
    let b = without;
    while (a.date < "2026-05-01") {
      a = advanceDay(a, {}).state;
      b = advanceDay(b, {}).state;
    }
    expect(a.fixtures).toEqual(b.fixtures);
    expect(a.finances).toEqual(b.finances);
    expect(a.rngState).toBe(b.rngState);
    expect(Object.values(a.coaches?.coaches ?? {}).some((coach) => coach.stints.some((stint) => stint.left === "fired"))).toBe(true);
  });
});
