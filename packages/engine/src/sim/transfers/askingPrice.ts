import { pickLineup, type PositionGroup } from "../../engine/match.js";
import type { IsoDate, SimPlayer, Tier } from "../gameState.js";
import { ASKING_PREMIUM } from "./tradeBetweenClubs.js";
import type { ListingMode } from "./transferMarket.js";
import { valuePlayer } from "./valuePlayer.js";

// guess: "caro e lento" asks 30% over market value, "barato e rápido" 10% under it. Brasfoot sells a
// listed player only when the price is at most 10-15% over value (club-market-match.md §2.3); here a
// high price still sells, just rarely.
export const LISTING_PREMIUM: Record<ListingMode, number> = { expensive: 1.3, cheap: 0.9 };
// Brasfoot prices an offer by the seller's need (best/l.java:544-588): a club holding a surplus at the
// position lets the player go near value, one that would lose a starter wants much more. guess: a
// starter costs half again his value; a surplus is four keepers or ten outfield players of a group.
const STARTER_PREMIUM = 1.5;
const SURPLUS: Record<PositionGroup, number> = { GK: 4, DEF: 10, MID: 10, ATT: 7 };

type Priced = Pick<SimPlayer, "strength" | "age" | "contractUntil">;

/** The price in BRL the coach asks for one of his players in `mode`. */
export function askingPrice(player: Priced, tier: Tier, date: IsoDate, eurBrl: number, mode: ListingMode): number {
  return Math.round(valuePlayer(player, tier, date) * eurBrl * LISTING_PREMIUM[mode]);
}

/**
 * What a club asks the coach in BRL for one of its players, by its need of him: market value when it
 * has a surplus at his position, half again for a starter, a tenth over value otherwise.
 */
export function sellerPrice(player: SimPlayer, squad: readonly SimPlayer[], tier: Tier, date: IsoDate, eurBrl: number): number {
  const value = valuePlayer(player, tier, date) * eurBrl;
  const isStarter = pickLineup([...squad]).some((p) => p.id === player.id);
  const isSurplus = squad.filter((p) => p.group === player.group).length >= SURPLUS[player.group];
  const premium = isStarter ? STARTER_PREMIUM : isSurplus ? 1 : ASKING_PREMIUM;
  return Math.round(value * premium);
}
