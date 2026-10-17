import { describe, expect, it } from "vitest";
import { pickLineup } from "../../engine/match.js";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import type { CoachRequest } from "./coachRequest.js";
import { lendYoungPlayers } from "./loans.js";
import { openDraft } from "./movePlayer.js";
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
const lenders = (index: number) => serieA[1 + index] ?? "";

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

/**
 * The state with players of `from(index)` (the given ages) already on loan at `to`; a `trained` one came up
 * through an academy. `pick` takes each lender's strongest first, or its weakest, never `sparing`.
 */
function withLoans(
  state: GameState,
  from: (index: number) => string,
  to: (index: number) => string,
  ages: readonly number[],
  { trained = false, pick = "strongest", sparing }: { trained?: boolean; pick?: "strongest" | "weakest"; sparing?: SimPlayer } = {},
): GameState {
  const players = { ...state.players };
  const loans: Record<string, Loan> = { ...state.market.loans };
  ages.forEach((age, index) => {
    const lender = from(index);
    const squad = squadOf(state, lender).filter((p) => !loans[p.id] && p.id !== sparing?.id).sort((a, b) => (pick === "strongest" ? b.strength - a.strength : a.strength - b.strength));
    const player = squad[0];
    if (!player) throw new Error(`no player at ${lender}`);
    players[player.id] = { ...player, clubId: to(index), age, ...(trained ? { potential: player.strength } : {}) };
    loans[player.id] = { fromClubId: lender, until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
  });
  return { ...state, players, market: { ...state.market, loans } };
}

/** The state with the clubs `ids` moved to Argentina's top league, so loans from them are international. */
function inArgentina(state: GameState, ids: readonly string[]): GameState {
  const clubs = { ...state.clubs };
  for (const id of ids) {
    const club = clubs[id];
    if (club) clubs[id] = { ...club, abroad: { country: "ar", level: 0 } };
  }
  return { ...state, clubs };
}

const toCoach = () => COACH;
const withPlayer = (state: GameState, player: SimPlayer): GameState => ({ ...state, players: { ...state.players, [player.id]: player } });

describe("FIFA's limits on international loans", () => {
  const abroad = inArgentina(rich, serieA.slice(0, 8));

  it("let a club hold six loanees from abroad at a time, and refuse the seventh", () => {
    const veteran = reserveOf(abroad, LENDER, 27);
    const five = withLoans(withPlayer(abroad, veteran), lenders, toCoach, [25, 26, 27, 28, 29]);
    expect(ask(five, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
    const six = withLoans(withPlayer(abroad, veteran), lenders, toCoach, [25, 26, 27, 28, 29, 30]);
    expect(ask(six, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: false, reason: "loanLimit" });
  });

  it("leave players of 21 or younger trained at their club out of that count", () => {
    const veteran = reserveOf(abroad, LENDER, 27);
    const youngsters = withLoans(withPlayer(abroad, veteran), lenders, toCoach, [19, 20, 21, 19, 20, 21], { trained: true });
    expect(ask(youngsters, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
  });

  it("count a player of 21 or younger his club did not train", () => {
    const veteran = reserveOf(abroad, LENDER, 27);
    const youngsters = withLoans(withPlayer(abroad, veteran), lenders, toCoach, [19, 20, 21, 19, 20, 21]);
    expect(ask(youngsters, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: false, reason: "loanLimit" });
  });

  it("let two clubs have at most three loans between them, whatever the age", () => {
    const youngster = { ...reserveOf(abroad, LENDER, 19), potential: 80 };
    const three = withLoans(withPlayer(abroad, youngster), () => LENDER, toCoach, [18, 19, 20], { trained: true });
    expect(ask(three, { kind: "loanIn", playerId: youngster.id }).decision).toMatchObject({ approved: false, reason: "loanPairLimit" });
  });

  it("leave domestic loans out of the six", () => {
    const veteran = reserveOf(abroad, LENDER, 27);
    const domestic = (index: number) => serieA[8 + index] ?? "";
    const six = withLoans(withPlayer(abroad, veteran), domestic, toCoach, [25, 26, 27, 28, 29, 30]);
    expect(ask(six, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
  });
});

describe("CBF's limits on domestic loans", () => {
  it("let a club hold more than six domestic loanees over 21", () => {
    const veteran = reserveOf(rich, LENDER, 27);
    const six = withLoans(withPlayer(rich, veteran), lenders, toCoach, [25, 26, 27, 28, 29, 30]);
    expect(ask(six, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
  });

  it("let a club hold sixteen domestic loans in, of any age, and refuse the seventeenth", () => {
    const veteran = reserveOf(rich, LENDER, 27);
    const ages = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 19, 20, 21, 22];
    const fifteen = withLoans(withPlayer(rich, veteran), lenders, toCoach, ages.slice(1), { trained: true });
    expect(ask(fifteen, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
    const sixteen = withLoans(withPlayer(rich, veteran), lenders, toCoach, ages, { trained: true });
    expect(ask(sixteen, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: false, reason: "nationalLoanLimit" });
  });

  it("hold a lender to sixteen domestic loans out, apart from its loans in", () => {
    const veteran = reserveOf(rich, LENDER, 27);
    const borrowers = Object.values(rich.clubs).filter((c) => c.division === "C").map((c) => c.id).sort();
    const out = withLoans(withPlayer(rich, veteran), () => LENDER, (index) => borrowers[index] ?? "", Array.from({ length: 16 }, () => 20), { pick: "weakest", sparing: veteran });
    expect(ask(out, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: false, reason: "nationalLoanLimit" });
    const coachOut = withLoans(withPlayer(rich, veteran), toCoach, (index) => borrowers[index] ?? "", Array.from({ length: 16 }, () => 20), { pick: "weakest" });
    expect(ask(coachOut, { kind: "loanIn", playerId: veteran.id }).decision).toMatchObject({ approved: true });
  });

  it("let two Brazilian clubs have at most three loans between them", () => {
    const youngster = reserveOf(rich, LENDER, 19);
    const three = withLoans(withPlayer(rich, youngster), () => LENDER, toCoach, [18, 19, 20]);
    expect(ask(three, { kind: "loanIn", playerId: youngster.id }).decision).toMatchObject({ approved: false, reason: "loanPairLimit" });
  });
});

describe("the AI clubs' loans", () => {
  it("never lend a fourth player to a club that already holds three of theirs", () => {
    const always = () => 0;
    const first = lendYoungPlayers(openDraft(windowEve), always).events[0];
    if (!first?.fromClubId || !first.toClubId) throw new Error("no AI club lent anyone");
    const lender = first.fromClubId;
    const borrower = first.toClubId;
    const group = windowEve.players[first.playerId]?.group;
    // Three of the lender's weakest over-21s of other positions, so the borrower still wants the same player.
    const others = squadOf(windowEve, lender).filter((p) => p.group !== group && p.age > 21).sort((a, b) => a.strength - b.strength).slice(0, 3);
    const players = { ...windowEve.players };
    const loans: Record<string, Loan> = { ...windowEve.market.loans };
    for (const p of others) {
      players[p.id] = { ...p, clubId: borrower };
      loans[p.id] = { fromClubId: lender, until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
    }
    const seeded = { ...windowEve, players, market: { ...windowEve.market, loans } };
    const { state } = lendYoungPlayers(openDraft(seeded), always);
    const between = Object.entries(state.market.loans).filter(([id, loan]) => loan.fromClubId === lender && state.players[id]?.clubId === borrower);
    expect(others).toHaveLength(3);
    expect(between).toHaveLength(3);
  });

  it("hold through a whole window", () => {
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
