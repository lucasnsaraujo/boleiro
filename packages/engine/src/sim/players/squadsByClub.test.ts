import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { movePlayer, openDraft } from "../transfers/movePlayer.js";
import { squadsByClub, squadsOfGame, withReplacedPlayers } from "./squadsByClub.js";

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

  it("show a move made in a draft to a reader of that draft", () => {
    const draft = openDraft(start);
    squadsOfGame(draft);
    movePlayer(draft, { playerId, kind: "transfer", toClubId: "palmeiras-sp", fee: 0 });
    expect(ids(squadsOfGame(draft).get("palmeiras-sp"))).toContain(playerId);
    expect(ids(squadsOfGame(draft).get("flamengo-rj"))).not.toContain(playerId);
  });

  it("follow every kind of move in a draft as a fresh build of it does", () => {
    const draft = openDraft(start);
    const at = (clubId: string, index: number) => ids(squadsOfGame(draft).get(clubId))[index] ?? "";
    const moves = [
      { playerId: at("santos-sp", 3), kind: "transfer", toClubId: "palmeiras-sp", fee: 0 },
      { playerId: at("santos-sp", 0), kind: "transfer", toClubId: "gremio-rs", fee: 0 },
      { playerId: at("gremio-rs", 5), kind: "released", toClubId: null, fee: 0 },
      { playerId: at("palmeiras-sp", 2), kind: "abroad", toClubId: null, fee: 0 },
    ] as const;
    for (const move of moves) {
      squadsOfGame(draft);
      movePlayer(draft, move);
      expect([...squadsOfGame(draft)]).toEqual([...squadsByClub(draft.players)]);
    }
    const [released] = Object.keys(draft.market.freeAgents);
    movePlayer(draft, { playerId: released ?? "", kind: "freeAgent", toClubId: "santos-sp", fee: 0 });
    expect([...squadsOfGame(draft)]).toEqual([...squadsByClub(draft.players)]);
  });

  it("put a club after another once its first player leaves a draft, as a fresh build does", () => {
    const [first, second] = squadsOfGame(start).get("santos-sp") ?? [];
    const [other] = squadsOfGame(start).get("palmeiras-sp") ?? [];
    if (!first || !second || !other) throw new Error("Santos or Palmeiras has no players");
    const draft = openDraft({ ...start, players: { [first.id]: first, [other.id]: other, [second.id]: second } });
    squadsOfGame(draft);
    movePlayer(draft, { playerId: first.id, kind: "abroad", toClubId: null, fee: 0 });
    expect([...squadsOfGame(draft).keys()]).toEqual(["palmeiras-sp", "santos-sp"]);
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

describe("a players map with some players replaced", () => {
  const before = squadsOfGame(start);
  const [keeper, outfielder] = before.get("santos-sp") ?? [];
  if (!keeper || !outfielder) throw new Error("Santos has no players");
  const tired = (player: SimPlayer): SimPlayer => ({ ...player, condition: { ...player.condition, injuredUntil: "2026-03-01" } });
  const players = withReplacedPlayers(start.players, [tired(keeper), tired(outfielder)]);

  it("has the squads a fresh build of it has", () => {
    expect(squadsOfGame({ players })).toEqual(squadsByClub(players));
    expect(squadsOfGame({ players }).get("santos-sp")).toContain(players[keeper.id]);
  });

  it("leaves the squads of the map it copied as they were", () => {
    expect(squadsOfGame(start).get("santos-sp")).toContain(keeper);
    expect(start.players[keeper.id]).toBe(keeper);
  });
});
