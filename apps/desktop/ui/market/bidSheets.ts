import { pickLineup, type PositionGroup } from "@boleiro/engine/engine/match";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { buyerWage } from "@boleiro/engine/sim/transfers/answerBid";
import { coachMarketOf } from "@boleiro/engine/sim/transfers/coachMarket";
import type { ListingMode } from "@boleiro/engine/sim/transfers/transferMarket";
import { valuePlayer } from "@boleiro/engine/sim/transfers/valuePlayer";
import { willingToJoin } from "@boleiro/engine/sim/transfers/willingToJoin";

export type SellState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "market" | "finances">;

/** One club's offer for one of the coach's players, with what taking it means for him. */
export type BidSheet = {
  playerId: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  /** null for a club abroad. */
  buyerId: string | null;
  fee: number;
  feeEur: number | null;
  /** Market value in BRL, the yardstick for the offer. */
  value: number;
  until: IsoDate;
  isFinal: boolean;
  cash: { before: number; after: number };
  /** Average strength of the best eleven, with him and without him. */
  teamStrength: { before: number; after: number };
  /** Who takes his place in the eleven; null when he was not in it. */
  successor: Pick<SimPlayer, "name" | "strength"> | null;
  contractUntil: IsoDate;
  /** The monthly wage he would earn at the buyer; null abroad. */
  newWage: number | null;
  /** Whether he wants the move; a player always wants Europe. */
  wantsToGo: boolean;
};

/** One of the coach's players on the market: listed at a price, or at auction. */
export type SaleRow = {
  playerId: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  value: number;
  contractUntil: IsoDate;
  wage: number;
} & ({ kind: "listing"; mode: ListingMode; price: number; hasOffer: boolean } | { kind: "auction"; minBid: number; closesOn: IsoDate; bids: { clubId: string; fee: number; date: IsoDate }[] });

const average = (players: readonly SimPlayer[]) => players.reduce((sum, p) => sum + p.strength, 0) / Math.max(1, players.length);

function squadOf(state: SellState, clubId: string): SimPlayer[] {
  return Object.values(state.players).filter((p) => p.clubId === clubId);
}

/** The offers waiting for the coach's answer, the soonest to lapse first. */
export function bidSheets(state: SellState): BidSheet[] {
  const { coachClubId } = state;
  if (!coachClubId) return [];
  const squad = squadOf(state, coachClubId);
  const lineup = pickLineup([...squad]);
  const tier = tierOf(state.clubs[coachClubId] ?? { division: null });
  const cash = state.finances[coachClubId]?.cash ?? 0;
  return Object.values(coachMarketOf(state).bids)
    .filter((bid) => bid.until >= state.date && state.players[bid.playerId]?.clubId === coachClubId)
    .sort((a, b) => a.until.localeCompare(b.until) || b.fee - a.fee)
    .flatMap((bid): BidSheet[] => {
      const player = state.players[bid.playerId];
      if (!player) return [];
      const without = pickLineup(squad.filter((p) => p.id !== player.id));
      const isStarter = lineup.some((p) => p.id === player.id);
      const successor = isStarter ? (without.find((p) => !lineup.some((q) => q.id === p.id)) ?? null) : null;
      const buyer = bid.buyerId ? state.clubs[bid.buyerId] : undefined;
      const newWage = bid.buyerId ? buyerWage(player, squadOf(state, bid.buyerId)) : null;
      const wantsToGo = !buyer || newWage === null || willingToJoin({ player, from: tier, to: { tier: tierOf(buyer), fanbase: buyer.fanbase }, wage: newWage }) >= 0.5;
      return [
        {
          playerId: player.id,
          name: player.name,
          group: player.group,
          age: player.age,
          strength: player.strength,
          buyerId: bid.buyerId,
          fee: bid.fee,
          feeEur: bid.feeEur,
          value: Math.round(valuePlayer(player, tier, state.date) * state.market.eurBrl),
          until: bid.until,
          isFinal: bid.isFinal,
          cash: { before: cash, after: cash + bid.fee },
          teamStrength: { before: average(lineup), after: average(without) },
          successor: successor && { name: successor.name, strength: successor.strength },
          contractUntil: player.contractUntil,
          newWage,
          wantsToGo,
        },
      ];
    });
}

/** The coach's players on the market, listings first, each by name. */
export function saleRows(state: SellState): SaleRow[] {
  const { coachClubId } = state;
  if (!coachClubId) return [];
  const tier = tierOf(state.clubs[coachClubId] ?? { division: null });
  const coach = coachMarketOf(state);
  const base = (playerId: string) => {
    const player = state.players[playerId];
    if (!player || player.clubId !== coachClubId) return null;
    const value = Math.round(valuePlayer(player, tier, state.date) * state.market.eurBrl);
    return { playerId, name: player.name, group: player.group, age: player.age, strength: player.strength, value, contractUntil: player.contractUntil, wage: player.wage };
  };
  const listings = Object.entries(coach.listings).flatMap(([playerId, listing]): SaleRow[] => {
    const row = base(playerId);
    return row ? [{ ...row, kind: "listing", mode: listing.mode, price: listing.price, hasOffer: !!coach.bids[playerId] }] : [];
  });
  const auctions = Object.entries(coach.auctions).flatMap(([playerId, auction]): SaleRow[] => {
    const row = base(playerId);
    return row ? [{ ...row, kind: "auction", minBid: auction.minBid, closesOn: auction.closesOn, bids: [...auction.bids].sort((a, b) => b.fee - a.fee) }] : [];
  });
  const byName = (a: SaleRow, b: SaleRow) => a.name.localeCompare(b.name, "pt-BR");
  return [...listings.sort(byName), ...auctions.sort(byName)];
}
