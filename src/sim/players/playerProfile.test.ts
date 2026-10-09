import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";

describe("a new game's players", () => {
  const state = loadNewGame(2026, { coachClubId: "flamengo-rj" });
  const players = Object.values(state.players);

  it("start rested, fit and settled", () => {
    expect(players.every((p) => p.condition.fatigue === 0 && p.condition.injuredUntil === null && p.condition.arrivedOn === null)).toBe(true);
  });

  it("keep their real age and nationalities", () => {
    const rossi = players.find((p) => p.name === "Agustín Rossi");
    expect(rossi?.nationalities).toEqual(["Argentina", "Italy"]);
    expect(players.every((p) => Number.isInteger(p.age) && p.age >= 15 && p.age <= 60)).toBe(true);
  });

  it("have at most one trait, and most have none", () => {
    const withTrait = players.filter((p) => p.trait !== null).length / players.length;
    expect(withTrait).toBeGreaterThan(0.05);
    expect(withTrait).toBeLessThan(0.35);
    expect(new Set(players.map((p) => p.trait))).toEqual(new Set([null, "injuryProne", "poorOnArtificialTurf"]));
  });
});
