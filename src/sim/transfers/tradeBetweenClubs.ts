import { pickLineup, type PositionGroup } from "../../engine/match.js";
import { addDays } from "../dates.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { boardRefusal } from "./boardRefusal.js";
import { contractEnd } from "./expireContracts.js";
import { marketView, type MarketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import { REPLACEMENT_BAND, SQUAD_TARGET, squadNeeds } from "./squadNeeds.js";
import type { PlayerMoved, PreContractSigned } from "./transferEvents.js";
import { valuePlayer } from "./valuePlayer.js";
import { wageDemandAt, wageRateOf } from "./wageDemand.js";
import { willingToJoin } from "./willingToJoin.js";

// guess: a selling club asks a tenth over market value.
export const ASKING_PREMIUM = 1.1;
// guess: a buyer scouts about 30 players a market day.
const SCOUTED = 30;
// guess: a full squad looks for players 1 to 10 strength points better than its weakest starter.
const UPGRADE = { min: 1, max: 10 };
// guess: a short squad makes at most three replacement signings a market day.
const REPLACEMENTS_PER_DAY = 3;
// guess: a club below 18 players will not sell.
export const MIN_SQUAD = 18;
// Pre-contracts can be signed in the last six months of a contract: FIFA Regulations on the Status and
// Transfer of Players art. 18(3); Lei 14.597/2023 (Lei Geral do Esporte) ends the bond when the contract ends.
export const PRE_CONTRACT_DAYS = 183;
const RANK = { A: 4, B: 3, C: 2, D: 1, state: 0 } as const;

type Pools = Record<PositionGroup, SimPlayer[]>;

function poolsOf(state: GameState): Pools {
  const pools: Pools = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of Object.values(state.players)) {
    if (state.market.loans[p.id] || state.market.preContracts[p.id]) continue;
    pools[p.group].push(p);
  }
  for (const pool of Object.values(pools)) pool.sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id));
  return pools;
}

const firstAbove = (pool: readonly SimPlayer[], strength: number) => {
  let lo = 0;
  let hi = pool.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((pool[mid]?.strength ?? 0) <= strength) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const isInPreContractWindow = (player: Pick<SimPlayer, "contractUntil">, date: string) => player.contractUntil <= addDays(date, PRE_CONTRACT_DAYS);

type Deal = { player: SimPlayer; fee: number; wage: number; preContract: boolean; released: SimPlayer | null };
type Market = { state: GameState; view: MarketView; pools: Pools; starters: (clubId: string) => ReadonlySet<string> };

function bestDeal({ state, view, pools, starters }: Market, buyerId: string, random: () => number): Deal | null {
  const finance = state.finances[buyerId];
  const club = state.clubs[buyerId];
  const squad = view.squad(buyerId);
  if (!finance || !club || squad.length < 11) return null;
  const buyerTier = view.tier(buyerId);
  const needs = squadNeeds(squad, buyerTier);
  if (!needs.weakest) return null;
  // A short squad replaces departures near its own level; a full one upgrades its weakest starter.
  const replacing = needs.short > 0;
  const group = replacing ? needs.thinnest : needs.weakest.group;
  const band = replacing
    ? { min: needs.level - REPLACEMENT_BAND.below, max: needs.level + REPLACEMENT_BAND.above }
    : { min: needs.weakest.strength + UPGRADE.min, max: needs.weakest.strength + UPGRADE.max };
  const pool = pools[group];
  const lo = firstAbove(pool, band.min);
  const hi = firstAbove(pool, band.max);
  if (hi <= lo) return null;
  const scouted = new Set<SimPlayer>();
  for (let i = 0; i < SCOUTED; i++) {
    const found = pool[lo + Math.floor(random() * (hi - lo))];
    if (found) scouted.add(found);
  }
  const rate = wageRateOf(squad);
  const inGroup = squad.filter((p) => p.group === group);
  const releasable = !replacing && inGroup.length ? inGroup.reduce((a, b) => (b.strength < a.strength ? b : a)) : null;
  for (const player of [...scouted].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))) {
    // The pools are built once a market day, so skip anyone who has moved since.
    if (player.clubId === buyerId || state.players[player.id]?.clubId !== player.clubId || state.market.preContracts[player.id]) continue;
    const preContract = isInPreContractWindow(player, state.date);
    if (player.clubId === state.coachClubId && !preContract) continue;
    const sellerTier = view.tier(player.clubId);
    if (replacing && RANK[sellerTier] > RANK[buyerTier]) continue;
    if (!preContract && view.squad(player.clubId).length <= MIN_SQUAD) continue;
    if (!preContract && RANK[sellerTier] >= RANK[buyerTier] && starters(player.clubId).has(player.id)) continue;
    const fee = preContract ? 0 : Math.round(valuePlayer(player, sellerTier, state.date) * state.market.eurBrl * ASKING_PREMIUM);
    const wage = wageDemandAt(player, rate);
    const released = squad.length >= SQUAD_TARGET[buyerTier] ? releasable : null;
    const cost = { upFront: fee + 2 * wage, wageChange: wage - (released?.wage ?? 0) };
    if (boardRefusal(finance, view.bill(buyerId), cost)) continue;
    if (random() >= willingToJoin({ player, from: sellerTier, to: { tier: buyerTier, fanbase: club.fanbase }, wage })) continue;
    return { player, fee, wage, preContract, released };
  }
  return null;
}

/**
 * One market day of AI clubs buying from each other, or signing pre-contracts, within board limits:
 * short squads replace departures near their level from clubs at or below their tier, full squads
 * upgrade their weakest starter.
 */
export function tradeBetweenClubs(state: GameState, random: () => number): { state: GameState; events: (PlayerMoved | PreContractSigned)[] } {
  const events: (PlayerMoved | PreContractSigned)[] = [];
  const buyers = Object.keys(state.finances).filter((id) => id !== state.coachClubId).sort();
  for (let i = buyers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [buyers[i], buyers[j]] = [buyers[j] ?? "", buyers[i] ?? ""];
  }
  const view = marketView(state);
  const lineups = new Map<string, ReadonlySet<string>>();
  const starters = (clubId: string) => {
    const known = lineups.get(clubId);
    if (known) return known;
    const ids = new Set(pickLineup([...view.squad(clubId)]).map((p) => p.id));
    lineups.set(clubId, ids);
    return ids;
  };
  const market: Market = { state, view, pools: poolsOf(state), starters };
  const year = Number(state.date.slice(0, 4));
  for (const buyerId of buyers) {
    for (let deals = 0; deals < REPLACEMENTS_PER_DAY; deals++) {
      const deal = bestDeal(market, buyerId, random);
      if (!deal) break;
      if (deal.preContract) {
        market.state.market.preContracts[deal.player.id] = buyerId;
        events.push({ type: "preContractSigned", playerId: deal.player.id, fromClubId: deal.player.clubId, toClubId: buyerId });
      } else {
        const contract = { wage: deal.wage, until: contractEnd(year + 1, random) };
        const moved = movePlayer(market.state, { playerId: deal.player.id, kind: "transfer", toClubId: buyerId, fee: deal.fee, contract }, view.squad);
        market.state = moved.state;
        events.push(moved.event);
        view.record(deal.player, market.state.players[deal.player.id] ?? null);
        lineups.delete(deal.player.clubId);
        if (deal.released) {
          const released = movePlayer(market.state, { playerId: deal.released.id, kind: "released", toClubId: null, fee: 0 });
          market.state = released.state;
          events.push(released.event);
          view.record(deal.released, null);
        }
      }
      if (squadNeeds(view.squad(buyerId), view.tier(buyerId)).short === 0) break;
    }
  }
  return { state: market.state, events };
}
