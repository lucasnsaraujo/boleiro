import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { passTheSeat, waitingCoachesOf } from "../coach/humanCoaches.js";
import { bookFriendly, freeFriendlyDates, isFree } from "../friendlies/friendlies.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { RAPIDO } from "../formats.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { answerBid } from "./answerBid.js";
import { coachMarketOf } from "./coachMarket.js";
import type { CoachRequest } from "./coachRequest.js";
import { decideCoachRequest } from "./decideCoachRequest.js";
import { compareText } from "../compareText.js";

const ANA = "flamengo-rj";
const BRUNO = "palmeiras-sp";
let game = loadNewGame(3, { coachClubId: ANA, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: BRUNO }] } });
while (game.date < "2026-01-05") game = advanceDay(game, {}).state;

const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};
const rich = (state: GameState, clubId: string): GameState => ({
  ...state,
  finances: { ...state.finances, [clubId]: { ...financeOf(state, clubId), transferBudget: 1e10, wageCap: 1e10 } },
});
const bestOf = (state: GameState, clubId: string): SimPlayer => {
  const best = Object.values(state.players).filter((p) => p.clubId === clubId).sort((a, b) => b.strength - a.strength || compareText(a.id, b.id))[0];
  if (!best) throw new Error(`no players at ${clubId}`);
  return best;
};
const decisionOf = (events: readonly DayEvent[]) => events.find((e) => e.type === "requestDecided");

/** Ana's board answers her request the next morning, with Bruno waiting for his turn. */
const anaAsks = (state: GameState, request: CoachRequest) => advanceDay(state, { requests: [request] });
/** Bruno's board answers his request the next morning, run as if he sat in the seat. */
const brunoAsks = (state: GameState, request: CoachRequest) => advanceDay(state, { waiting: [{ requests: [request] }] });

describe("an offer for a player of another human coach's club", () => {
  const before = rich(game, ANA);
  const star = bestOf(before, BRUNO);
  const day = anaAsks(before, { kind: "sign", playerId: star.id });

  it("leaves the player where he is until his coach answers", () => {
    expect(day.state.players[star.id]?.clubId).toBe(BRUNO);
    expect(day.events.some((e) => e.type === "playerMoved" && e.playerId === star.id)).toBe(false);
  });

  it("tells Ana her board sent it on to the other coach", () => {
    expect(decisionOf(day.events)).toMatchObject({ approved: true, reason: "sentToCoach" });
  });

  it("waits on Bruno's desk as an offer from Ana's club, and he hears of it, not Ana", () => {
    const bid = waitingCoachesOf(day.state)[0]?.market?.bids[star.id];
    expect(bid).toMatchObject({ buyerId: ANA, isFinal: true });
    expect(bid?.fee).toBeGreaterThan(0);
    expect(day.waitingEvents?.[0]).toContainEqual(expect.objectContaining({ type: "bidReceived", playerId: star.id, buyerId: ANA }));
    expect(day.events.some((e) => e.type === "bidReceived")).toBe(false);
  });

  it("moves him to Ana's club on Ana's terms when Bruno accepts on his turn", () => {
    const bid = waitingCoachesOf(day.state)[0]?.market?.bids[star.id];
    const brunoSeated = passTheSeat(day.state);
    const answered = answerBid(brunoSeated, star.id, { kind: "accept" });
    expect(answered.outcome).toBe("sold");
    const moved = answered.state.players[star.id];
    expect(moved?.clubId).toBe(ANA);
    expect(moved?.wage).toBe(bid?.contract?.wage);
    expect(answered.events).toContainEqual(expect.objectContaining({ kind: "transfer", fromClubId: BRUNO, toClubId: ANA, fee: bid?.fee }));
  });

  it("keeps him at Bruno's club when Bruno turns it down", () => {
    const answered = answerBid(passTheSeat(day.state), star.id, { kind: "decline" });
    expect(answered.state.players[star.id]?.clubId).toBe(BRUNO);
    expect(coachMarketOf(answered.state).bids[star.id]).toBeUndefined();
  });

  it("reaches the seated coach's desk when the waiting coach makes it", () => {
    const anaStar = bestOf(game, ANA);
    const asked = brunoAsks(rich(game, BRUNO), { kind: "sign", playerId: anaStar.id });
    expect(asked.state.players[anaStar.id]?.clubId).toBe(ANA);
    expect(coachMarketOf(asked.state).bids[anaStar.id]).toMatchObject({ buyerId: BRUNO });
    expect(asked.events).toContainEqual(expect.objectContaining({ type: "bidReceived", playerId: anaStar.id, buyerId: BRUNO }));
  });
});

describe("a small club's coach in a hot-seat game with Flamengo's", () => {
  const small = "juazeirense-ba";
  let world = loadNewGame(3, { coachClubId: small, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: ANA }] } });
  while (world.date < "2026-01-05") world = advanceDay(world, {}).state;

  it("can't borrow a Flamengo reserve: a loan offer has no desk of its own", () => {
    const reserve = Object.values(world.players).filter((p) => p.clubId === ANA).sort((a, b) => a.strength - b.strength || compareText(a.id, b.id))[0];
    if (!reserve) throw new Error("no Flamengo player");
    const day = anaAsks(rich(world, small), { kind: "loanIn", playerId: reserve.id });
    expect(decisionOf(day.events)).toMatchObject({ approved: false, reason: "otherCoachClub" });
    expect(day.state.players[reserve.id]?.clubId).toBe(ANA);
  });

  it("never sells to Flamengo, which didn't ask", () => {
    const player = bestOf(world, small);
    const day = anaAsks(world, { kind: "sell", playerId: player.id });
    expect(day.state.players[player.id]?.clubId).not.toBe(ANA);
  });
});

describe("a friendly against another human coach's club", () => {
  it("is refused at home or away", () => {
    const date = freeFriendlyDates(game).find((d) => isFree(game, BRUNO, d));
    if (!date) throw new Error("no free date");
    expect(bookFriendly(game, BRUNO, date, false).answer).toEqual({ booked: false, reason: "coach" });
    expect(bookFriendly(game, BRUNO, date, true).answer).toEqual({ booked: false, reason: "coach" });
  });
});

describe("an offer for a player another human coach has at auction", () => {
  const before = rich(game, ANA);
  const star = bestOf(before, BRUNO);
  const atAuction = (minBid: number): GameState => {
    const [bruno] = waitingCoachesOf(before);
    if (!bruno) throw new Error("no waiting coach");
    const market = { listings: {}, bids: {}, counters: {}, auctions: { [star.id]: { minBid, closesOn: "2026-01-20", bids: [] } } };
    return { ...before, waitingCoaches: [{ ...bruno, market }] };
  };

  it("joins his auction as a bid from Ana's club, with no offer on his desk", () => {
    const day = anaAsks(atAuction(1), { kind: "sign", playerId: star.id, fee: 50_000_000 });
    const desk = waitingCoachesOf(day.state)[0]?.market;
    expect(desk?.auctions[star.id]?.bids).toEqual([{ clubId: ANA, fee: 50_000_000, date: day.state.date, contract: expect.objectContaining({ wage: expect.any(Number) }) }]);
    expect(desk?.bids[star.id]).toBeUndefined();
    expect(decisionOf(day.events)).toMatchObject({ approved: true, reason: "sentToCoach" });
  });

  it("is refused below the auction's minimum bid", () => {
    const day = anaAsks(atAuction(60_000_000), { kind: "sign", playerId: star.id, fee: 50_000_000 });
    expect(decisionOf(day.events)).toMatchObject({ approved: false, reason: "auctionBidTooLow" });
  });
});

describe("an offer for a player of a club abroad another human coach runs", () => {
  const ARSENAL = "tm-11";
  const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
  let abroad = loadNewGame(3, { coachClubId: ANA, world, formats: RAPIDO, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: ARSENAL }] } });
  while (abroad.date < "2026-01-05") abroad = advanceDay(abroad, {}).state;

  it("waits on his desk too, and the player stays at his club", () => {
    const star = bestOf(abroad, ARSENAL);
    const day = anaAsks(rich(abroad, ANA), { kind: "sign", playerId: star.id });
    expect(day.state.players[star.id]?.clubId).toBe(ARSENAL);
    expect(waitingCoachesOf(day.state)[0]?.market?.bids[star.id]).toMatchObject({ buyerId: ANA });
  });

  it("refuses a friendly against his club", () => {
    const date = freeFriendlyDates(abroad).find((d) => isFree(abroad, ARSENAL, d));
    if (!date) throw new Error("no free date");
    expect(bookFriendly(abroad, ARSENAL, date, true).answer).toEqual({ booked: false, reason: "coach" });
  });
});

describe("review fixes for offers between human coaches", () => {
  const before = rich(game, ANA);
  const palmeiras = Object.values(before.players).filter((p) => p.clubId === BRUNO).sort((a, b) => b.strength - a.strength || compareText(a.id, b.id));
  const withBrunoDesk = (state: GameState, market: NonNullable<ReturnType<typeof waitingCoachesOf>[number]["market"]>): GameState => {
    const [bruno] = waitingCoachesOf(state);
    if (!bruno) throw new Error("no waiting coach");
    return { ...state, waitingCoaches: [{ ...bruno, market }] };
  };

  it("pays the winner of an auction the contract he agreed when he is a human coach", () => {
    const star = palmeiras[0];
    if (!star) throw new Error("no Palmeiras player");
    const auctioned = withBrunoDesk(before, { listings: {}, bids: {}, counters: {}, auctions: { [star.id]: { minBid: 1, closesOn: "2026-01-08", bids: [] } } });
    let state = anaAsks(auctioned, { kind: "sign", playerId: star.id, fee: 900_000_000, wage: 2_345_678, years: 4 }).state;
    while (state.date <= "2026-01-10") state = advanceDay(state, {}).state;
    expect(state.players[star.id]).toMatchObject({ clubId: ANA, wage: 2_345_678, contractUntil: "2029-12-31" });
  });

  it("lets a buyer whose board can no longer pay walk away when the other coach accepts", () => {
    const targets = palmeiras.slice(0, 3);
    let state = before;
    for (const player of targets) state = anaAsks(state, { kind: "sign", playerId: player.id, fee: 20_000_000, wage: player.wage * 3, years: 2 }).state;
    const bids = targets.map((player) => waitingCoachesOf(state)[0]?.market?.bids[player.id]);
    expect(bids.every((bid) => bid?.buyerId === ANA)).toBe(true);
    const upFront = (bid: (typeof bids)[number]) => (bid?.fee ?? 0) + 3 * (bid?.contract?.wage ?? 0);
    const short = { ...state, finances: { ...state.finances, [ANA]: { ...financeOf(state, ANA), transferBudget: upFront(bids[0]) + upFront(bids[1]) } } };
    let brunoSeated = passTheSeat(short);
    const outcomes = targets.map((player) => {
      const answered = answerBid(brunoSeated, player.id, { kind: "accept" });
      brunoSeated = answered.state;
      return answered.outcome;
    });
    expect(outcomes).toEqual(["sold", "sold", "walkedAway"]);
    expect(financeOf(brunoSeated, ANA).transferBudget).toBeGreaterThanOrEqual(0);
  });

  it("gives the other coach until his own window closes, not the buyer's", () => {
    const lastDays = { ...before, date: "2026-03-02", coach: { ...before.coach, personalWindowUntil: "2026-03-20" } };
    const star = palmeiras[0];
    if (!star) throw new Error("no Palmeiras player");
    const decided = decideCoachRequest(lastDays, { kind: "sign", playerId: star.id, wage: star.wage * 3 }, () => 0);
    expect(waitingCoachesOf(decided.state)[0]?.market?.bids[star.id]?.until).toBe("2026-03-03");
  });

  it("refuses to join an auction that already ended", () => {
    const star = palmeiras[0];
    if (!star) throw new Error("no Palmeiras player");
    const ended = withBrunoDesk(before, { listings: {}, bids: {}, counters: {}, auctions: { [star.id]: { minBid: 1, closesOn: "2026-01-04", bids: [] } } });
    const decided = decideCoachRequest(ended, { kind: "sign", playerId: star.id, fee: 900_000_000, wage: star.wage * 3 }, () => 0);
    expect(decided.events[0]).toMatchObject({ approved: false, reason: "auctionClosed" });
  });

  it("lets a coach raise his own offer while it still waits", () => {
    const star = palmeiras[0];
    if (!star) throw new Error("no Palmeiras player");
    const first = anaAsks(before, { kind: "sign", playerId: star.id, fee: 60_000_000, wage: star.wage * 3 }).state;
    const raised = anaAsks(first, { kind: "sign", playerId: star.id, fee: 80_000_000, wage: star.wage * 3 });
    expect(decisionOf(raised.events)).toMatchObject({ approved: true, reason: "sentToCoach" });
    expect(waitingCoachesOf(raised.state)[0]?.market?.bids[star.id]?.fee).toBe(80_000_000);
  });

  it("reaches a waiting coach's desk when another waiting coach makes it, and only he hears of it", () => {
    let three = loadNewGame(3, { coachClubId: "santos-sp", hotSeat: { coachName: "Carla", otherCoaches: [{ name: "Ana", clubId: ANA }, { name: "Bruno", clubId: BRUNO }] } });
    while (three.date < "2026-01-05") three = advanceDay(three, {}).state;
    const star = bestOf(three, BRUNO);
    const rich3 = rich(three, ANA);
    const day = advanceDay(rich3, { waiting: [{ requests: [{ kind: "sign", playerId: star.id, wage: star.wage * 3 }] }, {}] });
    expect(waitingCoachesOf(day.state)[1]?.market?.bids[star.id]).toMatchObject({ buyerId: ANA });
    expect(day.waitingEvents?.[1]).toContainEqual(expect.objectContaining({ type: "bidReceived", playerId: star.id }));
    expect(day.waitingEvents?.[0]?.some((e) => e.type === "bidReceived")).toBe(false);
    expect(day.events.some((e) => e.type === "bidReceived")).toBe(false);
  });
});
