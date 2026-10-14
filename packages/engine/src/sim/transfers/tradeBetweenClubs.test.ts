import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { openDraft } from "./movePlayer.js";
import { tradeBetweenClubs } from "./tradeBetweenClubs.js";

const start = loadNewGame(8, { coachClubId: null });
const window: GameState = { ...start, date: "2026-01-10" };
const squads = new Map<string, SimPlayer[]>();
for (const p of Object.values(window.players)) squads.set(p.clubId, [...(squads.get(p.clubId) ?? []), p]);
const clubIds = Object.keys(window.clubs).sort();
// Each club's weakest player in every position has agreed to join the next club on the list.
const preContracts = Object.fromEntries(
  [...squads].flatMap(([clubId, squad]) =>
    (["GK", "DEF", "MID", "ATT"] as const).flatMap((group) => {
      const weakest = squad.filter((p) => p.group === group).sort((a, b) => a.strength - b.strength)[0];
      const joining = clubIds[(clubIds.indexOf(clubId) + 1) % clubIds.length] ?? "";
      return weakest ? [[weakest.id, joining]] : [];
    }),
  ),
);
const rich: GameState = {
  ...window,
  finances: Object.fromEntries(Object.entries(window.finances).map(([id, f]) => [id, { ...f, transferBudget: 1e12, wageCap: 1e12 }])),
  market: { ...window.market, preContracts },
};

describe("AI clubs trading", () => {
  it("never release a player who has agreed to join another club, keeping that club's pre-contract", () => {
    const agreed = Object.entries(preContracts);
    const { state, events } = tradeBetweenClubs(openDraft(rich), seededRandom(2));
    expect(events.filter((e) => e.type === "playerMoved" && e.kind === "released").length).toBeGreaterThan(0);
    for (const [playerId, clubId] of agreed) expect(state.market.preContracts[playerId], playerId).toBe(clubId);
  });
});
