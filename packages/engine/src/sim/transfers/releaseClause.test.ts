import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import type { CoachRequest } from "./coachRequest.js";
import { MIN_SQUAD } from "./tradeBetweenClubs.js";

const COACH = "flamengo-rj";
let windowEve = loadNewGame(4, { coachClubId: COACH });
while (windowEve.date < "2026-01-05") windowEve = advanceDay(windowEve, {}).state;

const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};
const rich = (state: GameState): GameState => ({
  ...state,
  finances: { ...state.finances, [COACH]: { ...financeOf(state, COACH), transferBudget: 1e10, wageCap: 1e10 } },
});

function ask(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { requests: [request] });
  const decision = day.events.find((e): e is Extract<DayEvent, { type: "requestDecided" }> => e.type === "requestDecided");
  if (!decision) throw new Error("no decision");
  return { ...day, decision };
}

/** A Série B club cut down to the fewest players it will sell from, and its best player on a low wage. */
function shortSquadStar(state: GameState): { state: GameState; star: SimPlayer } {
  const club = Object.values(state.clubs).find((c) => c.division === "B");
  const squad = squadOf(state, club?.id ?? "").sort((a, b) => b.strength - a.strength);
  const star = squad[0];
  if (!star) throw new Error("no Série B player");
  const players = { ...state.players, [star.id]: { ...star, wage: 20_000, contractUntil: "2029-12-31" } };
  for (const extra of squad.slice(MIN_SQUAD)) Reflect.deleteProperty(players, extra.id);
  return { state: { ...state, players }, star: { ...star, wage: 20_000, contractUntil: "2029-12-31" } };
}

describe("a release clause", () => {
  it("takes a player his club would not sell, paying his club two thousand times his monthly wage", () => {
    const { state: short, star } = shortSquadStar(rich(windowEve));
    expect(ask(short, { kind: "sign", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "sellerWillNotSell" });
    const { state, decision, events } = ask(short, { kind: "payClause", playerId: star.id });
    expect(decision).toMatchObject({ approved: true });
    expect(state.players[star.id]?.clubId).toBe(COACH);
    expect(events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "releaseClause", playerId: star.id, fee: 40_000_000 }));
    const sales = (s: GameState) => financeOf(s, star.clubId).month.revenue.playerSales;
    expect(sales(state) - sales(short)).toBe(40_000_000);
  });

  it("still needs the player to want the move", () => {
    const { state: short, star } = shortSquadStar(rich(windowEve));
    const { state, decision } = ask(short, { kind: "payClause", playerId: star.id, wage: 1 });
    expect(decision).toMatchObject({ approved: false, reason: "playerUnwilling" });
    expect(state.players[star.id]?.clubId).toBe(star.clubId);
    expect(financeOf(state, star.clubId).month.revenue.playerSales).toBe(financeOf(short, star.clubId).month.revenue.playerSales);
  });

  it("is paid only inside a transfer window", () => {
    const { state: short, star } = shortSquadStar(rich(windowEve));
    expect(ask({ ...short, date: "2026-04-10" }, { kind: "payClause", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "windowClosed" });
  });

  it("must fit the transfer budget like any fee", () => {
    const { state: short, star } = shortSquadStar(windowEve);
    const broke = { ...short, finances: { ...short.finances, [COACH]: { ...financeOf(short, COACH), transferBudget: 0, wageCap: 1e10 } } };
    expect(ask(broke, { kind: "payClause", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "transferBudget" });
  });
});
