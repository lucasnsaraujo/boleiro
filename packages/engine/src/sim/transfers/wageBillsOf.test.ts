import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { squadsOfGame, withReplacedPlayers } from "../players/squadsByClub.js";
import { marketView } from "./marketView.js";
import { wageBillsOf } from "./wageBillsOf.js";

const start = loadNewGame(5, { coachClubId: null });
const [player] = squadsOfGame(start).get("santos-sp") ?? [];
if (!player) throw new Error("Santos has no players");
const fullBill = (clubId: string) => Object.values(start.players).filter((p) => p.clubId === clubId).reduce((sum, p) => sum + p.wage, 0);

describe("wage bills", () => {
  it("add up each club's wages", () => {
    expect(wageBillsOf(start).get("santos-sp")).toBe(fullBill("santos-sp"));
    expect(marketView(start).bill("santos-sp")).toBe(fullBill("santos-sp"));
  });

  it("follow a raise in a squad whose bill was added up before", () => {
    wageBillsOf(start);
    const raised = { ...start, players: withReplacedPlayers(start.players, [{ ...player, wage: player.wage + 1000 }]) };
    expect(wageBillsOf(raised).get("santos-sp")).toBe(fullBill("santos-sp") + 1000);
    expect(marketView(raised).bill("santos-sp")).toBe(fullBill("santos-sp") + 1000);
  });
});
