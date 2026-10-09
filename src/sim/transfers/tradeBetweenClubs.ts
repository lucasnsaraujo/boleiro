import { pickLineup, type PositionGroup } from "../../engine/match.js";
import { addDays } from "../dates.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { boardRefusal } from "./boardRefusal.js";
import { contractEnd } from "./expireContracts.js";
import { marketView, type MarketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import type { PlayerMoved, PreContractSigned } from "./transferEvents.js";
import { valuePlayer } from "./valuePlayer.js";
import { wageDemand } from "./wageDemand.js";
import { willingToJoin } from "./willingToJoin.js";

// guess: a selling club asks a tenth over market value.
export const ASKING_PREMIUM = 1.1;
// guess: a buyer scouts about 30 players a market day who would improve its weakest starter.
const SCOUTED = 30;
// guess: a buyer looks for players 1 to 10 strength points better than its weakest starter.
const UPGRADE = { min: 1, max: 10 };
// guess: a club below 18 players will not sell; one above 26 releases its weakest in the position it strengthens.
export const MIN_SQUAD = 18;
const RELEASE_ABOVE = 26;
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

function bestDeal(state: GameState, view: MarketView, buyerId: string, pools: Pools, random: () => number): Deal | null {
  const finance = state.finances[buyerId];
  const club = state.clubs[buyerId];
  const squad = view.squad(buyerId);
  if (!finance || !club || squad.length < 11) return null;
  const weakest = pickLineup([...squad]).reduce((a, b) => (b.strength < a.strength ? b : a));
  const pool = pools[weakest.group];
  const lo = firstAbove(pool, weakest.strength + UPGRADE.min);
  const hi = firstAbove(pool, weakest.strength + UPGRADE.max);
  if (hi <= lo) return null;
  const scouted = new Set<SimPlayer>();
  for (let i = 0; i < SCOUTED; i++) {
    const found = pool[lo + Math.floor(random() * (hi - lo))];
    if (found) scouted.add(found);
  }
  const buyerTier = view.tier(buyerId);
  const releasable = squad.length >= RELEASE_ABOVE ? squad.filter((p) => p.group === weakest.group).reduce((a, b) => (b.strength < a.strength ? b : a)) : null;
  for (const player of [...scouted].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))) {
    // The pools are built once a market day, so skip anyone who has moved since.
    if (player.clubId === buyerId || state.players[player.id]?.clubId !== player.clubId || state.market.preContracts[player.id]) continue;
    const preContract = isInPreContractWindow(player, state.date);
    if (player.clubId === state.coachClubId && !preContract) continue;
    const sellerTier = view.tier(player.clubId);
    const sellerSquad = view.squad(player.clubId);
    if (!preContract && sellerSquad.length <= MIN_SQUAD) continue;
    const starter = pickLineup([...sellerSquad]).includes(player);
    if (!preContract && starter && RANK[sellerTier] >= RANK[buyerTier]) continue;
    const fee = preContract ? 0 : Math.round(valuePlayer(player, sellerTier, state.date) * state.market.eurBrl * ASKING_PREMIUM);
    const wage = wageDemand(player, squad);
    const cost = { upFront: fee + 2 * wage, wageChange: wage - (releasable?.wage ?? 0) };
    if (boardRefusal(finance, view.bill(buyerId), cost)) continue;
    if (random() >= willingToJoin({ player, from: sellerTier, to: { tier: buyerTier, fanbase: club.fanbase }, wage })) continue;
    return { player, fee, wage, preContract, released: releasable };
  }
  return null;
}

/** One market day of AI clubs buying from each other, or signing pre-contracts, within board limits. */
export function tradeBetweenClubs(state: GameState, random: () => number): { state: GameState; events: (PlayerMoved | PreContractSigned)[] } {
  const events: (PlayerMoved | PreContractSigned)[] = [];
  const buyers = Object.keys(state.finances).filter((id) => id !== state.coachClubId).sort();
  for (let i = buyers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [buyers[i], buyers[j]] = [buyers[j] ?? "", buyers[i] ?? ""];
  }
  let next = state;
  const view = marketView(next);
  const pools = poolsOf(next);
  const year = Number(state.date.slice(0, 4));
  for (const buyerId of buyers) {
    const deal = bestDeal(next, view, buyerId, pools, random);
    if (!deal) continue;
    if (deal.preContract) {
      next = { ...next, market: { ...next.market, preContracts: { ...next.market.preContracts, [deal.player.id]: buyerId } } };
      events.push({ type: "preContractSigned", playerId: deal.player.id, fromClubId: deal.player.clubId, toClubId: buyerId });
    } else {
      const contract = { wage: deal.wage, until: contractEnd(year + 1, random) };
      const moved = movePlayer(next, { playerId: deal.player.id, kind: "transfer", toClubId: buyerId, fee: deal.fee, contract });
      next = moved.state;
      events.push(moved.event);
      view.record(deal.player, next.players[deal.player.id] ?? null);
      if (deal.released) {
        const released = movePlayer(next, { playerId: deal.released.id, kind: "released", toClubId: null, fee: 0 });
        next = released.state;
        events.push(released.event);
        view.record(deal.released, null);
      }
    }
  }
  return { state: next, events };
}
