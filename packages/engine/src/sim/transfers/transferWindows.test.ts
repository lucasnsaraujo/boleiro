import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import type { CoachRequest } from "./coachRequest.js";
import type { MoveKind } from "./transferEvents.js";

const COACH = "flamengo-rj";
const WAITING_COACH = "palmeiras-sp";
const NEW_CLUB = "bahia-ba";
const MID_SEASON_OPENS = "2026-07-20";
const MID_SEASON_CLOSES = "2026-09-11";

let played = loadNewGame(4, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: WAITING_COACH }] } });
while (played.date < "2026-07-19") played = advanceDay(played, {}).state;
// Coaches who never pick an eleven are sacked by July; they are put back at their clubs for the requests.
const windowEve: GameState = {
  ...played,
  coachClubId: COACH,
  waitingCoaches: (played.waitingCoaches ?? []).map((coach) => ({ ...coach, clubId: WAITING_COACH })),
};
const withoutMidSeasonWindow: GameState = { ...windowEve, hasMidSeasonWindow: false };
// The moves a window lets clubs make; loans ending, contracts running out and pre-contracts land any day.
const WINDOW_MOVES: readonly MoveKind[] = ["transfer", "freeAgent", "abroad", "fromAbroad", "loan", "loanBuy"];

const rich = (state: GameState, ...clubIds: string[]): GameState => {
  const finances = { ...state.finances };
  for (const clubId of clubIds.length ? clubIds : [COACH]) {
    const finance = finances[clubId];
    if (!finance) throw new Error(`no finances for ${clubId}`);
    finances[clubId] = { ...finance, transferBudget: 1e10, wageCap: 1e10 };
  }
  return { ...state, finances };
};

/** A Série B club's strongest player, the kind a Série A board signs when the window lets it. */
function serieBStandout(state: GameState): SimPlayer {
  const club = Object.values(state.clubs).find((c) => c.division === "B");
  const best = Object.values(state.players).filter((p) => p.clubId === club?.id).sort((a, b) => b.strength - a.strength)[0];
  if (!best) throw new Error("no Série B player");
  return best;
}

/** The board's answer, the next morning, to the coach in the seat asking for `request` today. */
function answer(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { requests: [request] });
  const decision = day.events.find((e) => e.type === "requestDecided");
  if (!decision) throw new Error("no decision");
  return decision;
}

/** The board's answer, the next morning, to the waiting hot-seat coach asking for `request` on his turn today. */
function waitingAnswer(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { waiting: [{ requests: [request] }] });
  const decision = day.waitingEvents?.[0]?.find((e) => e.type === "requestDecided");
  if (!decision) throw new Error("no decision");
  return decision;
}

/** The coach in the seat after taking `NEW_CLUB`'s offer on the day `state` plays. */
function hiredAtNewClub(state: GameState): GameState {
  const offer = { clubId: NEW_CLUB, salary: 50_000, untilSeason: 2027, expiresOn: "2026-12-31" };
  return advanceDay({ ...state, coach: { ...state.coach, offers: [offer] } }, { acceptOffer: NEW_CLUB }).state;
}

function playThrough(state: GameState, until: string): GameState {
  let next = state;
  while (next.date < until) next = advanceDay(next, {}).state;
  return next;
}

/** The clubs' moves in the days from the state's date through `until`. */
function movesThrough(state: GameState, until: string): DayEvent[] {
  const moves: DayEvent[] = [];
  let next = state;
  while (next.date <= until) {
    const day = advanceDay(next, {});
    moves.push(...day.events.filter((e) => e.type === "playerMoved" && WINDOW_MOVES.includes(e.kind)));
    next = day.state;
  }
  return moves;
}

describe("a game without the mid-season window", () => {
  it("is one started with the option off, and keeps it in its save; a game started as usual leaves it out", () => {
    expect(loadGame(saveGame(loadNewGame(1, { coachClubId: COACH, midSeasonWindow: false }))).hasMidSeasonWindow).toBe(false);
    expect("hasMidSeasonWindow" in loadNewGame(1, { coachClubId: COACH })).toBe(false);
    expect("hasMidSeasonWindow" in loadNewGame(1, { coachClubId: COACH, midSeasonWindow: true })).toBe(false);
  });

  it("has no club business between July and September, which a game with the window has", () => {
    expect(movesThrough(windowEve, MID_SEASON_CLOSES).length).toBeGreaterThan(0);
    expect(movesThrough(withoutMidSeasonWindow, MID_SEASON_CLOSES)).toEqual([]);
  });
});

describe("a coach's request without the mid-season window", () => {
  const inAugust = (state: GameState): GameState => rich({ ...state, date: "2026-08-10" });
  const target = serieBStandout(windowEve);

  it("is turned down in August for the closed window, where the window would let the board decide", () => {
    expect(answer(inAugust(windowEve), { kind: "sign", playerId: target.id })).not.toMatchObject({ reason: "windowClosed" });
    expect(answer(inAugust(withoutMidSeasonWindow), { kind: "sign", playerId: target.id })).toMatchObject({ approved: false, reason: "windowClosed" });
  });
});

describe("a coach's own window after taking a club outside the game's windows", () => {
  const target = serieBStandout(windowEve);
  // Without the mid-season window, the 20th of July is outside every window.
  const hired = hiredAtNewClub(withoutMidSeasonWindow);

  it("opens for ten days from his first day at the new club", () => {
    expect(hired.coachClubId).toBe(NEW_CLUB);
    expect(hired.date).toBe(MID_SEASON_OPENS);
    expect(hired.coach.personalWindowUntil).toBe("2026-07-29");
  });

  it("lets his board sign players until its last day and turns him down after it", () => {
    expect(answer(rich(hired, NEW_CLUB), { kind: "sign", playerId: target.id })).not.toMatchObject({ reason: "windowClosed" });
    const lastDayToAsk = playThrough(hired, "2026-07-28");
    expect(answer(rich(lastDayToAsk, NEW_CLUB), { kind: "sign", playerId: target.id })).not.toMatchObject({ reason: "windowClosed" });
    const tooLate = playThrough(lastDayToAsk, "2026-07-29");
    expect(answer(rich(tooLate, NEW_CLUB), { kind: "sign", playerId: target.id })).toMatchObject({ approved: false, reason: "windowClosed" });
  });

  it("stays shut for the other coaches and the AI clubs", () => {
    expect(waitingAnswer(rich(hired, WAITING_COACH), { kind: "sign", playerId: target.id })).toMatchObject({ approved: false, reason: "windowClosed" });
    expect(movesThrough(hired, "2026-07-29")).toEqual([]);
  });

  it("does not open when he moves inside the game's window with ten days or more of it left", () => {
    expect(hiredAtNewClub(windowEve).coach.personalWindowUntil).toBeUndefined();
  });

  it("runs ten days past a game window that closes sooner after his move", () => {
    const lastDays = { ...windowEve, date: "2026-09-09" };
    expect(hiredAtNewClub(lastDays).coach.personalWindowUntil).toBe("2026-09-19");
  });

  it("runs on to the close of a game window that opens before it ends", () => {
    const yearEnd = { ...withoutMidSeasonWindow, date: "2026-12-29" };
    expect(hiredAtNewClub(yearEnd).coach.personalWindowUntil).toBe("2027-03-03");
  });
});
