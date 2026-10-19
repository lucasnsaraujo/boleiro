import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { loadEurope } from "./loadEurope.js";
import { loadGuests } from "./loadGuests.js";
import { withWorldNationalities } from "./withWorldNationalities.js";
import type { WorldClub } from "./world.js";

const ARSENAL = "tm-11";
const REAL_MADRID = "tm-418";
const europe = loadEurope(2026);
const guests = loadGuests(2026);
const game = loadNewGame(5, { coachClubId: ARSENAL, world: europe, guests });

/** The game as a save from before citizenships held it: none on the world's clubs, none on the players abroad. */
function beforeCitizenships(state: GameState): GameState {
  const strip = (club: WorldClub): WorldClub => {
    const copy = { ...club };
    Reflect.deleteProperty(copy, "nationalities");
    return copy;
  };
  const world = Object.fromEntries(Object.entries(state.world ?? {}).map(([id, country]) => [id, { ...country, clubs: Object.fromEntries(Object.entries(country.clubs).map(([clubId, club]) => [clubId, strip(club)])) }]));
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, state.clubs[p.clubId]?.abroad ? { ...p, nationalities: [] } : p]));
  const stripped = { ...state, world, players, ...(state.guests ? { guests: Object.fromEntries(Object.entries(state.guests).map(([id, clubs]) => [id, clubs.map(strip)])) } : {}) };
  return loadGame(saveGame(stripped));
}

describe("a save from before the world kept citizenships", () => {
  const old = beforeCitizenships(game);
  const loaded = withWorldNationalities(old, { world: europe, guests });

  it("gets its world clubs' and its guests' citizenships from the packs", () => {
    expect(old.world?.es?.clubs[REAL_MADRID]?.nationalities).toBeUndefined();
    expect(loaded.world?.es?.clubs[REAL_MADRID]?.nationalities).toEqual(game.world?.es?.clubs[REAL_MADRID]?.nationalities);
    expect(loaded.guests).toEqual(game.guests);
  });

  it("gets its players abroad their citizenships by club and name", () => {
    const raya = Object.values(loaded.players).find((p) => p.clubId === ARSENAL && p.name === "David Raya");
    expect(raya?.nationalities).toEqual(["Spain"]);
    expect(loaded.players).toEqual(game.players);
  });

  it("leaves a save that has them as it was", () => {
    expect(withWorldNationalities(game, { world: europe, guests })).toBe(game);
  });
});
