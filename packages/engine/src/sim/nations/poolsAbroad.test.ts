import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { joinFullTier } from "../world/joinFullTier.js";
import { loadEurope } from "../world/loadEurope.js";
import { OUTSIDER_MARK } from "./callUps.js";
import { poolOf } from "./nationalJobs.js";

const football = loadNationalFootball();
const europe = loadEurope(2026);
const ARSENAL = "tm-11";

/** How often Saka stands in England's pool as one of the game's players, and as one of its outsiders. */
function sakaIn(state: GameState) {
  const pool = poolOf(state, "england");
  const outsiders = state.nations?.outsiders.england;
  return {
    inGame: pool.filter((ref) => state.players[ref]?.name === "Bukayo Saka" && state.players[ref]?.clubId === ARSENAL).length,
    asOutsider: pool.filter((ref) => ref.startsWith(OUTSIDER_MARK) && outsiders?.names[Number(ref.slice(OUTSIDER_MARK.length))] === "Bukayo Saka").length,
  };
}

describe("a national team's pool with a league abroad in the full tier", () => {
  it("holds a player of the club abroad the coach starts at once, as one of the game's own", () => {
    expect(sakaIn(loadNewGame(5, { coachClubId: ARSENAL, world: europe, nationalFootball: football }))).toEqual({ inGame: 1, asOutsider: 0 });
  });

  it("takes in once the players of a country joining the full tier mid-season, no longer as outsiders", () => {
    const flamengo = loadNewGame(5, { coachClubId: "flamengo-rj", world: europe, nationalFootball: football });
    expect(sakaIn(flamengo)).toEqual({ inGame: 0, asOutsider: 1 });
    expect(sakaIn(joinFullTier(flamengo, "gb-eng"))).toEqual({ inGame: 1, asOutsider: 0 });
  });
});
