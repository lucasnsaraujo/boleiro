import { describe, expect, test } from "vitest";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { boardNotes, dueRequests, withRequest } from "./boardDesk.js";

const COACH = "sport-pe";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const on = (date: string): GameState => ({ ...game, date });
const own = Object.values(game.players).find((p) => p.clubId === COACH);
const other = Object.values(game.players).find((p) => p.clubId === "palmeiras-sp");
if (!own || !other) throw new Error("no players");

describe("the coach's pending requests", () => {
  test("a new request for a player replaces the one already waiting for him", () => {
    const pending = withRequest([{ kind: "sell", playerId: own.id }], { kind: "renew", playerId: own.id, years: 2 });
    expect(withRequest(pending, { kind: "sign", playerId: other.id })).toEqual([
      { kind: "renew", playerId: own.id, years: 2 },
      { kind: "sign", playerId: other.id },
    ]);
  });

  test("requests that need the window wait until the board would decide them inside it; the rest go at once", () => {
    const sell = { kind: "sell", playerId: own.id } as const;
    const renew = { kind: "renew", playerId: own.id, years: 2 } as const;
    expect(dueRequests(on("2026-01-03"), [sell, renew])).toEqual({ due: [renew], waiting: [sell] });
    expect(dueRequests(on("2026-01-04"), [sell])).toEqual({ due: [sell], waiting: [] });
    expect(dueRequests(on("2026-03-03"), [sell])).toEqual({ due: [], waiting: [sell] });
  });
});

describe("what the board did for the coach's club in one day", () => {
  test("keeps its answers with the player's name, and its forced sales; other clubs' sales are left out", () => {
    const events = [
      { type: "requestDecided", request: { kind: "sign", playerId: other.id }, approved: false, reason: "transferBudget" },
      { type: "forcedSale", clubId: COACH, playerId: own.id, buyerId: "palmeiras-sp", fee: 1_000_000 },
      { type: "forcedSale", clubId: "ceara-ce", playerId: other.id, buyerId: null, fee: 5 },
    ] as const;
    expect(boardNotes(on("2026-02-01"), on("2026-02-02"), events)).toEqual({
      answers: [{ date: "2026-02-01", request: { kind: "sign", playerId: other.id }, name: other.name, approved: false, reason: "transferBudget" }],
      forcedSales: [{ date: "2026-02-01", name: own.name, buyerId: "palmeiras-sp", fee: 1_000_000 }],
    });
  });
});
