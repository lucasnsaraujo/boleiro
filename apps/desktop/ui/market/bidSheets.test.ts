import { describe, expect, test } from "vitest";
import { pickLineup } from "@boleiro/engine/engine/match";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { coachMarketOf, withCoachMarket } from "@boleiro/engine/sim/transfers/coachMarket";
import { listPlayer } from "@boleiro/engine/sim/transfers/listPlayer";
import type { Bid } from "@boleiro/engine/sim/transfers/transferMarket";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { bidSheets, saleRows } from "./bidSheets.js";

const COACH = "sport-pe";
const game: GameState = { ...newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles), date: "2026-01-10" };
const squad = Object.values(game.players).filter((p) => p.clubId === COACH);
const lineup = pickLineup([...squad]);
const starter = lineup[lineup.length - 1];
const reserve = squad.find((p) => !lineup.includes(p));
if (!starter || !reserve) throw new Error("Sport has starters and reserves");

function withBids(state: GameState, ...bids: (Partial<Bid> & { playerId: string })[]): GameState {
  const full = bids.map((bid): Bid => ({ buyerId: "vitoria-ba", fee: 5_000_000, feeEur: null, ceiling: 6_000_000, isFinal: false, madeOn: state.date, until: "2026-01-12", ...bid }));
  return withCoachMarket(state, { ...coachMarketOf(state), bids: Object.fromEntries(full.map((bid) => [bid.playerId, bid])) });
}

describe("the offers on the coach's desk", () => {
  test("show the cash the sale brings and who takes a starter's place in a weaker eleven", () => {
    const [sheet] = bidSheets(withBids(game, { playerId: starter.id }));
    expect(sheet?.cash.after).toBe((sheet?.cash.before ?? 0) + 5_000_000);
    expect(sheet?.successor).not.toBeNull();
    expect(sheet?.successor?.strength).toBeLessThanOrEqual(starter.strength);
    expect(sheet?.teamStrength.after).toBeLessThanOrEqual(sheet?.teamStrength.before ?? 0);
  });

  test("leave the eleven as it is when a reserve goes", () => {
    const [sheet] = bidSheets(withBids(game, { playerId: reserve.id }));
    expect(sheet?.successor).toBeNull();
    expect(sheet?.teamStrength.after).toBe(sheet?.teamStrength.before);
  });

  test("leave out offers that lapsed, and put the soonest to lapse first", () => {
    const sheets = bidSheets(withBids(game, { playerId: reserve.id, until: "2026-01-12" }, { playerId: starter.id, until: "2026-01-11" }, { playerId: "gone", until: "2026-01-09" }));
    expect(sheets.map((s) => s.playerId)).toEqual([starter.id, reserve.id]);
  });

  test("say a player always wants a move abroad", () => {
    expect(bidSheets(withBids(game, { playerId: reserve.id, buyerId: null }))[0]).toMatchObject({ buyerId: null, wantsToGo: true, newWage: null });
  });
});

describe("the coach's players on the market", () => {
  test("list each listing with its mode and price and each auction with its bids, best first", () => {
    const window = { ...game, date: "2026-01-06" };
    let state = listPlayer(listPlayer(window, reserve.id, "cheap"), starter.id, "auction");
    const auction = coachMarketOf(state).auctions[starter.id];
    if (!auction) throw new Error("no auction");
    const bids = [{ clubId: "vitoria-ba", fee: auction.minBid, date: window.date }, { clubId: "bahia-ba", fee: auction.minBid + 1, date: window.date }];
    state = withCoachMarket(state, { ...coachMarketOf(state), auctions: { [starter.id]: { ...auction, bids } } });
    const rows = saleRows(state);
    expect(rows[0]).toMatchObject({ playerId: reserve.id, kind: "listing", mode: "cheap", hasOffer: false });
    expect(rows[1]).toMatchObject({ playerId: starter.id, kind: "auction" });
    expect(rows[1]?.kind === "auction" && rows[1].bids.map((b) => b.clubId)).toEqual(["bahia-ba", "vitoria-ba"]);
  });
});
