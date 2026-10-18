import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";

const football = loadNationalFootball();
const start = loadNewGame(5, { coachClubId: null, nationalFootball: football });

describe("national football as a game opens it", () => {
  it("keeps every real squad player whose club is not in the game among the outsiders, whatever his name", () => {
    const gameClubs = new Set(Object.values(start.clubs).map((club) => club.transfermarktId).filter((id) => id !== ""));
    const missing = football.squads
      .filter((p) => !p.clubTransfermarktId || !gameClubs.has(p.clubTransfermarktId))
      .filter((p) => !start.nations?.outsiders[p.teamId]?.names.includes(p.name))
      .map((p) => `${p.teamId}: ${p.name} (${p.clubName})`);
    expect(missing).toEqual([]);
  });

  it("leaves out of the outsiders a real squad player who plays for one of the game's clubs", () => {
    const tmIdOf = (clubId: string) => start.clubs[clubId]?.transfermarktId;
    const inGame = football.squads.filter((p) => Object.values(start.players).some((g) => g.name === p.name && tmIdOf(g.clubId) === p.clubTransfermarktId));
    expect(inGame.length).toBeGreaterThan(10);
    for (const p of inGame) expect(start.nations?.outsiders[p.teamId]?.names, `${p.teamId}: ${p.name}`).not.toContain(p.name);
  });
});
