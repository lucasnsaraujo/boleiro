import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { squadsByClub } from "../players/squadsByClub.js";
import type { CoachRequest } from "./coachRequest.js";
import { sellerPrice } from "./askingPrice.js";
import { releaseClauseOf } from "./releaseClause.js";
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

function ask(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { requests: [request] });
  const decision = day.events.find((e): e is Extract<DayEvent, { type: "requestDecided" }> => e.type === "requestDecided");
  if (!decision) throw new Error("no decision");
  return { ...day, decision };
}

/** A Série B club cut down to the fewest players it will sell from, and its best player. */
function shortSquadStar(state: GameState): { state: GameState; star: SimPlayer } {
  const club = Object.values(state.clubs).find((c) => c.division === "B");
  const squad = squadOf(state, club?.id ?? "").sort((a, b) => b.strength - a.strength);
  const star = squad[0];
  if (!star) throw new Error("no Série B player");
  const players = { ...state.players };
  for (const extra of squad.slice(MIN_SQUAD)) Reflect.deleteProperty(players, extra.id);
  return { state: { ...state, players }, star };
}

describe("a release clause", () => {
  it("takes a player his club would not sell, paying his club his release clause", () => {
    const { state: short, star } = shortSquadStar(windowEve);
    const clause = releaseClauseOf(star, "B", short.market.eurBrl);
    expect(ask(short, { kind: "sign", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "sellerWillNotSell" });
    const { state, decision, events } = ask(short, { kind: "payClause", playerId: star.id });
    expect(decision).toMatchObject({ approved: true });
    expect(state.players[star.id]?.clubId).toBe(COACH);
    expect(events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "releaseClause", playerId: star.id, fee: clause }));
    const sales = (s: GameState) => financeOf(s, star.clubId).month.revenue.playerSales;
    expect(sales(state) - sales(short)).toBe(clause);
  });

  it("still needs the player to want the move", () => {
    const { state: short, star } = shortSquadStar(windowEve);
    const { state, decision } = ask(short, { kind: "payClause", playerId: star.id, wage: 1 });
    expect(decision).toMatchObject({ approved: false, reason: "playerUnwilling" });
    expect(state.players[star.id]?.clubId).toBe(star.clubId);
    expect(financeOf(state, star.clubId).month.revenue.playerSales).toBe(financeOf(short, star.clubId).month.revenue.playerSales);
  });

  it("is paid only inside a transfer window", () => {
    const { state: short, star } = shortSquadStar(windowEve);
    expect(ask({ ...short, date: "2026-04-10" }, { kind: "payClause", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "windowClosed" });
  });

  it("must fit the transfer budget like any fee", () => {
    const { state: short, star } = shortSquadStar(windowEve);
    const broke = { ...short, finances: { ...short.finances, [COACH]: { ...financeOf(short, COACH), transferBudget: 0, wageCap: 1e10 } } };
    expect(ask(broke, { kind: "payClause", playerId: star.id }).decision).toMatchObject({ approved: false, reason: "transferBudget" });
  });
});

describe("a release clause in a hot-seat game", () => {
  it("takes a player from another human coach's club, who has no say either", () => {
    const rival = "palmeiras-sp";
    let game = loadNewGame(4, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: rival }] } });
    while (game.date < "2026-01-05") game = advanceDay(game, {}).state;
    const budget = financeOf(game, COACH).transferBudget;
    const star = squadOf(game, rival).sort((a, b) => b.strength - a.strength).find((p) => releaseClauseOf(p, "A", game.market.eurBrl) + 3 * p.wage <= budget);
    if (!star) throw new Error("no Palmeiras player Flamengo can pay for");
    const { state, decision } = ask(game, { kind: "payClause", playerId: star.id });
    expect(decision).toMatchObject({ approved: true });
    expect(state.players[star.id]?.clubId).toBe(COACH);
  });
});

describe("release clauses in a new world", () => {
  const game = loadNewGame(4, { coachClubId: COACH });
  const serieA = new Set(Object.values(game.clubs).filter((c) => c.division === "A").map((c) => c.id));
  const players = Object.values(game.players).filter((p) => serieA.has(p.clubId));
  const clauseOf = (player: SimPlayer) => releaseClauseOf(player, "A", game.market.eurBrl);

  it("never go over the legal cap of two thousand monthly wages", () => {
    expect(players.every((p) => clauseOf(p) > 0 && clauseOf(p) <= 2000 * p.wage)).toBe(true);
  });

  it("cost a few times what his club asks, not hundreds of times", () => {
    const squads = squadsByClub(game.players);
    const ratios = players.map((p) => clauseOf(p) / sellerPrice(p, squads.get(p.clubId) ?? [], "A", game.date, game.market.eurBrl)).sort((a, b) => a - b);
    expect(ratios[Math.floor(ratios.length / 2)]).toBeLessThan(10);
  });

  it("are within a top budget's reach for a good share of Série A", () => {
    const topBudget = Math.max(...[...serieA].map((id) => game.finances[id]?.transferBudget ?? 0));
    const affordable = players.filter((p) => clauseOf(p) <= topBudget).length;
    expect(affordable / players.length).toBeGreaterThan(0.3);
  });
});
