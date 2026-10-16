import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { movePlayer, openDraft } from "../transfers/movePlayer.js";
import { squadsOfGame } from "./squadsByClub.js";

const start = loadNewGame(5, { coachClubId: null });
const ids = (squad: readonly { id: string }[] | undefined) => (squad ?? []).map((p) => p.id);

describe("a game's shared squads", () => {
  const before = squadsOfGame(start);
  const [playerId] = ids(before.get("flamengo-rj"));
  if (!playerId) throw new Error("Flamengo has no players");
  const moved = movePlayer(openDraft(start), { playerId, kind: "transfer", toClubId: "palmeiras-sp", fee: 0 }).state;

  it("list each club's players", () => {
    const flamengo = Object.values(start.players).filter((p) => p.clubId === "flamengo-rj").map((p) => p.id);
    expect(ids(before.get("flamengo-rj"))).toEqual(flamengo);
  });

  it("show a move in the game after it and leave the game before it as it was", () => {
    expect(ids(squadsOfGame(moved).get("palmeiras-sp"))).toContain(playerId);
    expect(ids(squadsOfGame(moved).get("flamengo-rj"))).not.toContain(playerId);
    expect(ids(squadsOfGame(start).get("flamengo-rj"))).toContain(playerId);
  });

  it("follow the players from one day to the next", () => {
    let state = moved;
    for (let day = 0; day < 40; day++) {
      squadsOfGame(state);
      state = advanceDay(state, {}).state;
    }
    const players = Object.values(state.players);
    for (const [clubId, squad] of squadsOfGame(state)) expect(squad).toEqual(players.filter((p) => p.clubId === clubId));
  });
});
