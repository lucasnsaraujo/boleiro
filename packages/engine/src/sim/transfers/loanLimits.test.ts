import { describe, expect, it } from "vitest";
import { pickLineup } from "../../engine/match.js";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import type { CoachRequest } from "./coachRequest.js";
import type { Loan } from "./transferMarket.js";

const COACH = "sport-pe";
let windowEve = loadNewGame(4, { coachClubId: COACH });
while (windowEve.date < "2026-01-05") windowEve = advanceDay(windowEve, {}).state;
const finance = windowEve.finances[COACH];
if (!finance) throw new Error("no finances for Sport");
const rich: GameState = { ...windowEve, finances: { ...windowEve.finances, [COACH]: { ...finance, transferBudget: 1e10, wageCap: 1e10 } } };

const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const serieA = Object.values(rich.clubs).filter((c) => c.division === "A").map((c) => c.id).sort();
const LENDER = serieA[0] ?? "";

function ask(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { requests: [request] });
  const decision = day.events.find((e): e is Extract<DayEvent, { type: "requestDecided" }> => e.type === "requestDecided");
  if (!decision) throw new Error("no decision");
  return { ...day, decision };
}

/** A reserve of `clubId`, of `age`, with years left on his contract. */
function reserveOf(state: GameState, clubId: string, age: number): SimPlayer {
  const squad = squadOf(state, clubId);
  const lineup = new Set(pickLineup([...squad]).map((p) => p.id));
  const found = squad.filter((p) => !lineup.has(p.id)).sort((a, b) => a.strength - b.strength)[0];
  if (!found) throw new Error(`no reserve at ${clubId}`);
  return { ...found, age, contractUntil: "2029-12-31" };
}

/** The state with `count` players of `from` (the given ages) already on loan at `to`. */
function withLoans(state: GameState, from: (index: number) => string, to: string, ages: readonly number[]): GameState {
  const players = { ...state.players };
  const loans: Record<string, Loan> = { ...state.market.loans };
  ages.forEach((age, index) => {
    const lender = from(index);
    const player = squadOf(state, lender).sort((a, b) => b.strength - a.strength)[index];
    if (!player) throw new Error(`no player at ${lender}`);
    players[player.id] = { ...player, clubId: to, age };
    loans[player.id] = { fromClubId: lender, until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
  });
  return { ...state, players, market: { ...state.market, loans } };
}

describe("FIFA's loan limits", () => {
  const lenders = (index: number) => serieA[1 + index] ?? "";

  it("let a club hold six loanees over 21 at a time, and refuse the seventh", () => {
    const veteran = reserveOf(rich, LENDER, 27);
    const five = withLoans({ ...rich, players: { ...rich.players, [veteran.id]: veteran } }, lenders, COACH, [25, 26, 27, 28, 29]);
    expect(ask(five, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
    const six = withLoans({ ...rich, players: { ...rich.players, [veteran.id]: veteran } }, lenders, COACH, [25, 26, 27, 28, 29, 30]);
    expect(ask(six, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: false, reason: "loanLimit" });
  });

  it("leave players of 21 or younger out of that count", () => {
    const veteran = reserveOf(rich, LENDER, 27);
    const youngsters = withLoans({ ...rich, players: { ...rich.players, [veteran.id]: veteran } }, lenders, COACH, [19, 20, 21, 19, 20, 21]);
    expect(ask(youngsters, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
  });

  it("let two clubs have at most three loans between them, whatever the age", () => {
    const youngster = reserveOf(rich, LENDER, 19);
    const three = withLoans({ ...rich, players: { ...rich.players, [youngster.id]: youngster } }, () => LENDER, COACH, [18, 19, 20]);
    expect(ask(three, { kind: "loanIn", playerId: youngster.id }).decision).toMatchObject({ approved: false, reason: "loanPairLimit" });
  });

  it("hold for the AI clubs through a whole window", () => {
    let state = windowEve;
    while (state.date < "2026-02-05") state = advanceDay(state, {}).state;
    const pairs = new Map<string, number>();
    const overAge = new Map<string, number>();
    for (const [playerId, loan] of Object.entries(state.market.loans)) {
      const player = state.players[playerId];
      if (!player) continue;
      const pair = `${loan.fromClubId}>${player.clubId}`;
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
      if (player.age > 21) for (const id of [loan.fromClubId, player.clubId]) overAge.set(id, (overAge.get(id) ?? 0) + 1);
    }
    expect(pairs.size).toBeGreaterThan(0);
    expect(Math.max(...pairs.values())).toBeLessThanOrEqual(3);
    expect(Math.max(0, ...overAge.values())).toBeLessThanOrEqual(6);
  });
});
