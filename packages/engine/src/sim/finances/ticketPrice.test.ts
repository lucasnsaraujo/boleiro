import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { attendance } from "./recordMatchFinances.js";
import { assistantTicketPrice, setTicketPrice, ticketPriceBounds } from "./setTicketPrice.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: CLUB });

/** The eve of the coach's first home game. */
function homeGameEve(state: GameState): GameState {
  let current = state;
  while (!current.fixtures.some((f) => f.date === current.date && f.homeId === CLUB && !f.result)) current = advanceDay(current, {}).state;
  return current;
}

const eve = homeGameEve(start);
/** The coach's board expects last place, so it never sacks him and his club stays his whatever the results. */
function withPatientBoard(state: GameState): GameState {
  const board = state.boards[CLUB];
  if (!board) throw new Error("no board");
  return { ...state, boards: { ...state.boards, [CLUB]: { ...board, targetPosition: board.tableSize } } };
}
const ticketsOf = (state: GameState) => state.finances[CLUB]?.month.revenue.tickets ?? 0;

describe("the coach's ticket price", () => {
  it("starts at the assistant's price, the division's average", () => {
    expect(eve.finances[CLUB]?.ticketPrice).toBe(assistantTicketPrice(eve, CLUB));
  });

  it("sets the gate of his next home game", () => {
    const price = Math.round(assistantTicketPrice(eve, CLUB) * 1.5);
    const priced = setTicketPrice(eve, price);
    const fixture = priced.fixtures.find((f) => f.date === eve.date && f.homeId === CLUB);
    const finance = priced.finances[CLUB];
    if (!fixture || !finance) throw new Error("no home game on the eve");
    const crowd = attendance(priced, finance, CLUB, fixture.awayId, fixture);
    const after = advanceDay(priced, {}).state;
    const usual = advanceDay(eve, {}).state;
    expect(ticketsOf(after) - ticketsOf(priced)).toBe(Math.round(crowd * price));
    expect(ticketsOf(after)).not.toBe(ticketsOf(usual));
    expect(after.finances[CLUB]?.homeGates?.at(-1)).toEqual({
      date: eve.date, competitionId: fixture.competitionId, opponentId: fixture.awayId, price, crowd, gate: Math.round(crowd * price),
    });
  });

  it("keeps only his own club's last five home games at the gate", () => {
    let state = withPatientBoard(eve);
    for (let day = 0; day < 120; day++) state = advanceDay(state, {}).state;
    const gates = state.finances[CLUB]?.homeGates ?? [];
    expect(gates).toHaveLength(5);
    expect(gates.map((g) => g.date)).toEqual([...gates.map((g) => g.date)].sort());
    expect(Object.entries(state.finances).filter(([id, f]) => id !== CLUB && f.homeGates)).toEqual([]);
  }, 30_000); // four months of days

  it("refuses prices outside the box or with cents", () => {
    const { min, max } = ticketPriceBounds(eve, CLUB);
    expect(() => setTicketPrice(eve, min - 1)).toThrow();
    expect(() => setTicketPrice(eve, max + 1)).toThrow();
    expect(() => setTicketPrice(eve, min + 0.5)).toThrow();
    expect(setTicketPrice(eve, max).finances[CLUB]?.ticketPrice).toBe(max);
  });

  it("plays on from a save written before ticket prices and gates were kept", () => {
    const played = advanceDay(eve, {}).state;
    const old = JSON.parse(saveGame(played), (key, value: unknown) => (key === "homeGates" || key === "stadiumWorks" ? undefined : value));
    const loaded = loadGame(JSON.stringify(old));
    expect(loaded.finances[CLUB]?.homeGates).toBeUndefined();
    const next = homeGameEve(advanceDay(loaded, {}).state);
    expect(advanceDay(next, {}).state.finances[CLUB]?.homeGates).toHaveLength(1);
  });

  it("goes back to the assistant's price at the club he leaves", () => {
    const priced = setTicketPrice(advanceDay(eve, {}).state, assistantTicketPrice(eve, CLUB) * 2);
    const offer = { clubId: "bahia-ba", salary: 100_000, untilSeason: 2027, expiresOn: "2027-01-01" };
    const offered: GameState = { ...priced, coach: { ...priced.coach, offers: [offer] } };
    const moved = advanceDay(offered, { acceptOffer: "bahia-ba" }).state;
    expect(moved.coachClubId).toBe("bahia-ba");
    expect(moved.finances[CLUB]?.ticketPrice).toBe(assistantTicketPrice(moved, CLUB));
    expect(moved.finances[CLUB]?.homeGates).toBeUndefined();
  });

  it("needs a club", () => {
    expect(() => setTicketPrice({ ...eve, coachClubId: null }, assistantTicketPrice(eve, CLUB))).toThrow();
  });
});
