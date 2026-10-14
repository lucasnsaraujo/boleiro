import { describe, expect, test } from "vitest";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { playerCard } from "./playerCard.js";

const game = newGameFromFiles(7, { coachClubId: "bahia-ba" }, bundledGameFiles);
const player = Object.values(game.players).find((p) => p.clubId === "bahia-ba");
const stranger = Object.values(game.players).find((p) => p.clubId !== "bahia-ba");
if (!player || !stranger) throw new Error("need players");

describe("playerCard", () => {
  test("an unknown player has no card", () => {
    expect(playerCard(game, "nobody")).toBeNull();
  });

  test("a new game's player has no goals, cards or games yet", () => {
    const card = playerCard(game, player.id);
    expect(card).toMatchObject({ id: player.id, name: player.name, strength: player.strength, isCoachsPlayer: true, status: null });
    expect(card?.season).toEqual({ goals: [], minutes: 0, yellows: [] });
    expect(card?.atClub).toEqual({ apps: 0, goals: 0 });
  });

  test("season goals and pending yellows are per competition, named as fans name them", () => {
    const history: GameState["history"] = {
      ...game.history,
      current: { ...game.history.current, goals: { "state-ba": { [player.id]: 2 }, "serie-a": { [player.id]: 3, [stranger.id]: 7 } } },
      players: { "bahia-ba": { [player.id]: { name: player.name, apps: 9, goals: 5 } } },
    };
    const discipline = { "serie-a-2026": { [player.id]: { yellows: 2, phase: 0, bans: 0 } } };
    const card = playerCard({ ...game, history, discipline }, player.id);
    expect(card?.season.goals).toEqual([
      { competition: "Série A", goals: 3 },
      { competition: "Baiano", goals: 2 },
    ]);
    expect(card?.season.yellows).toEqual([{ competition: "Série A", yellows: 2 }]);
    expect(card?.atClub).toEqual({ apps: 9, goals: 5 });
  });

  test("yellows from a competition that is over are gone", () => {
    const discipline = { "state-ba-2026": { [player.id]: { yellows: 2, phase: 0, bans: 0 } } };
    const fixtures = game.fixtures.map((f) => (f.competitionId === "state-ba-2026" ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f));
    expect(playerCard({ ...game, discipline }, player.id)?.season.yellows).toEqual([{ competition: "Baiano", yellows: 2 }]);
    expect(playerCard({ ...game, discipline, fixtures }, player.id)?.season.yellows).toEqual([]);
  });

  test("yellows from a competition his club is out of are gone", () => {
    const discipline = { "copa-do-brasil-2026": { [player.id]: { yellows: 1, phase: 0, bans: 0 } } };
    expect(playerCard({ ...game, discipline }, player.id)?.season.yellows).toEqual([]);
  });

  test("the contract shows a loan and a signed pre-contract", () => {
    const market: GameState["market"] = {
      ...game.market,
      loans: { [player.id]: { fromClubId: "vitoria-ba", until: "2026-06-30", lenderWageShare: 0.5, buyOption: null } },
      preContracts: { [player.id]: "gremio-rs" },
    };
    expect(playerCard({ ...game, market }, player.id)?.contract).toEqual({
      until: player.contractUntil,
      wage: player.wage,
      loan: { fromClubId: "vitoria-ba", until: "2026-06-30" },
      leavesForId: "gremio-rs",
    });
  });

  test("a new game's player has one strength mark, this season's", () => {
    expect(playerCard(game, player.id)?.strengthBySeason).toEqual([{ season: 2026, strength: player.strength }]);
  });

  test("strength history runs oldest first and ends with this season's, even for a player who arrived mid-season", () => {
    const strength = { [player.id]: [{ season: 2025, strength: 61.2 }] };
    expect(playerCard({ ...game, history: { ...game.history, strength } }, player.id)?.strengthBySeason).toEqual([
      { season: 2025, strength: 61.2 },
      { season: 2026, strength: player.strength },
    ]);
  });

  test("a player from another club is not the coach's to sell or renew", () => {
    expect(playerCard(game, stranger.id)?.isCoachsPlayer).toBe(false);
  });
});
