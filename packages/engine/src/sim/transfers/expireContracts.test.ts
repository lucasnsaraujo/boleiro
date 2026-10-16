import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { squadsOfGame, withReplacedPlayers } from "../players/squadsByClub.js";
import { hasExpiries } from "./expireContracts.js";

const start = loadNewGame(5, { coachClubId: null });
const [player] = squadsOfGame(start).get("santos-sp") ?? [];
if (!player) throw new Error("Santos has no players");
const withContract = (state: GameState, contractUntil: string): GameState => ({ ...state, players: withReplacedPlayers(state.players, [{ ...player, contractUntil }]) });

describe("hasExpiries", () => {
  it("finds no contract run out on the first day", () => {
    expect(hasExpiries(start)).toBe(false);
  });

  it("finds a contract that ran out in a squad looked at before", () => {
    hasExpiries(start);
    const expired = withContract(start, "2025-12-31");
    expect(hasExpiries(expired)).toBe(true);
    expect(hasExpiries(withContract(expired, "2027-12-31"))).toBe(false);
  });
});
