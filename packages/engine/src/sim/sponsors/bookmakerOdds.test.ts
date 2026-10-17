import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { BOOKMAKER_MARGIN, bookmakerOdds } from "./bookmakerOdds.js";

describe("a betting sponsor's odds", () => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj" });
  const fixtures = game.fixtures.filter((f) => f.competitionId.includes("serie-a")).slice(0, 10);

  it("prices a match from the engine's chances with the bookmaker's margin on top", () => {
    for (const fixture of fixtures) {
      const odds = bookmakerOdds(game, fixture);
      const booked = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
      expect(booked).toBeGreaterThan(1 + BOOKMAKER_MARGIN - 0.01);
      expect(booked).toBeLessThan(1 + BOOKMAKER_MARGIN + 0.01);
    }
  });

  it("gives the stronger side the shorter price", () => {
    const flamengoHome = game.fixtures.find((f) => f.homeId === "flamengo-rj" && game.clubs[f.awayId]?.division === "A");
    if (!flamengoHome) throw new Error("Flamengo has no Série A home game");
    const odds = bookmakerOdds(game, flamengoHome);
    expect(odds.home).toBeLessThan(odds.away);
  });
});
