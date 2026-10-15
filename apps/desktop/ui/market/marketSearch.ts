import type { Division } from "@boleiro/data/players";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import { addDays } from "@boleiro/engine/sim/dates";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { squadsByClub } from "@boleiro/engine/sim/players/squadsByClub";
import { sellerPrice } from "@boleiro/engine/sim/transfers/askingPrice";
import { valuePlayer } from "@boleiro/engine/sim/transfers/valuePlayer";
import { isInPreContractWindow } from "@boleiro/engine/sim/transfers/tradeBetweenClubs";
import { TRANSFER_WINDOWS } from "@boleiro/engine/sim/transfers/transferWindows";
import { wageDemandAt, wageRateOf } from "@boleiro/engine/sim/transfers/wageDemand";
import { willingToJoin } from "@boleiro/engine/sim/transfers/willingToJoin";
import { isLendable, lineupsOf } from "@boleiro/game-client/market/coachRequests";

/** The statuses the market can be filtered by. */
export type MarketStatus = "freeAgent" | "contractEnding" | "lendable";
/** A row's status: the filterable ones, or why he can't be bought. */
export type RowStatus = MarketStatus | "onLoan" | "preContract" | null;
export type Willingness = "yes" | "maybe" | "no";

export type MarketFilters = {
  name: string;
  group: PositionGroup | null;
  minStrength: number | null;
  maxStrength: number | null;
  clubId: string | null;
  division: Division | null;
  status: MarketStatus | null;
  /** Only players who would say yes or maybe to joining the coach's club. */
  isWillingOnly: boolean;
};

export const NO_FILTERS: MarketFilters = { name: "", group: null, minStrength: null, maxStrength: null, clubId: null, division: null, status: null, isWillingOnly: false };

export type MarketRow = {
  id: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  /** null for a free agent. */
  clubId: string | null;
  status: RowStatus;
  /** What his club asks in BRL, by its need of him: 0 for a free agent or a pre-contract, null when he can't be bought. */
  price: number | null;
  /** The monthly wage he asks to join the coach's club. */
  wage: number;
  /** Market value in BRL. */
  value: number;
  /** What he earns now, and until when; a free agent's is from the club he left. */
  currentWage: number;
  contractUntil: IsoDate;
  willing: Willingness;
};

export type MarketState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "market">;

// guess: above 60% the coach can count on a yes, under 35% he shouldn't.
const SURE_YES = 0.6;
const LIKELY_NO = 0.35;

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The transfer window today: open until a date, or closed until the next opening. */
export function windowStatus(date: IsoDate): { isOpen: boolean; date: IsoDate } {
  const day = date.slice(5);
  const year = Number(date.slice(0, 4));
  const open = TRANSFER_WINDOWS.find((w) => day >= w.opens && day <= w.closes);
  if (open) return { isOpen: true, date: `${year}-${open.closes}` };
  const next = TRANSFER_WINDOWS.find((w) => day < w.opens);
  return next ? { isOpen: false, date: `${year}-${next.opens}` } : { isOpen: false, date: `${year + 1}-${TRANSFER_WINDOWS[0]?.opens ?? "01-01"}` };
}

/** The weakest and strongest rounded strength among other clubs' players and free agents: the strength range's ends. */
export function strengthBounds(state: Pick<GameState, "coachClubId" | "players" | "market">): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const take = (player: SimPlayer) => {
    const strength = Math.round(player.strength);
    min = Math.min(min, strength);
    max = Math.max(max, strength);
  };
  for (const player of Object.values(state.players)) if (player.clubId !== state.coachClubId) take(player);
  for (const player of Object.values(state.market.freeAgents)) take(player);
  return min > max ? { min: 1, max: 99 } : { min, max };
}

/** Other clubs' players and free agents that match, strongest first: how many, and the first `limit` as rows. */
export function searchMarket(state: MarketState, filters: MarketFilters, limit: number): { total: number; rows: MarketRow[] } {
  const { coachClubId, market, date } = state;
  const lineupOf = lineupsOf(state.players);
  const name = fold(filters.name.trim());
  const coachSquad = Object.values(state.players).filter((p) => p.clubId === coachClubId);
  const rate = wageRateOf(coachSquad);
  const coachClub = coachClubId ? state.clubs[coachClubId] : undefined;
  const to = { tier: tierOf(coachClub ?? { division: null }), fanbase: coachClub?.fanbase ?? 0 };
  const tierOfClub = (clubId: string) => tierOf(state.clubs[clubId] ?? { division: null });

  const statusOf = (player: SimPlayer, free: boolean): RowStatus => {
    if (free) return "freeAgent";
    if (market.loans[player.id]) return "onLoan";
    if (market.preContracts[player.id]) return "preContract";
    if (isInPreContractWindow(player, date)) return "contractEnding";
    return null;
  };

  // As the board prices it: a free agent gets the club's going rate, anyone else asks for a raise.
  const wageOf = (player: SimPlayer, free: boolean) => (free ? Math.max(1, rate(player.strength)) : wageDemandAt(player, rate));
  const willingnessOf = (player: SimPlayer, free: boolean): Willingness => {
    const chance = willingToJoin({ player, from: tierOfClub(player.clubId), to, wage: wageOf(player, free), unemployed: free });
    return chance >= SURE_YES ? "yes" : chance >= LIKELY_NO ? "maybe" : "no";
  };

  const matches = (player: SimPlayer, free: boolean): boolean => {
    const strength = Math.round(player.strength);
    if (filters.group && player.group !== filters.group) return false;
    if (filters.minStrength !== null && strength < filters.minStrength) return false;
    if (filters.maxStrength !== null && strength > filters.maxStrength) return false;
    if (filters.clubId && (free || player.clubId !== filters.clubId)) return false;
    if (filters.division && (free || state.clubs[player.clubId]?.division !== filters.division)) return false;
    if (name && !fold(player.name).includes(name)) return false;
    if (filters.isWillingOnly && willingnessOf(player, free) === "no") return false;
    if (filters.status === "lendable") return !free && statusOf(player, false) === null && isLendable(state, player, lineupOf);
    return filters.status === null || statusOf(player, free) === filters.status;
  };

  const found: { player: SimPlayer; free: boolean }[] = [];
  for (const player of Object.values(state.players)) if (player.clubId !== coachClubId && matches(player, false)) found.push({ player, free: false });
  for (const player of Object.values(market.freeAgents)) if (matches(player, true)) found.push({ player, free: true });
  found.sort((a, b) => b.player.strength - a.player.strength || a.player.name.localeCompare(b.player.name, "pt-BR"));

  const page = found.slice(0, limit);
  const squads = page.length ? squadsByClub(state.players) : new Map<string, SimPlayer[]>();
  const rows = page.map(({ player, free }): MarketRow => {
    const status = statusOf(player, free);
    const fromTier = tierOfClub(player.clubId);
    // The club decides the morning after an offer, so the price is tomorrow's.
    const fee = status === "freeAgent" || status === "contractEnding" ? 0 : sellerPrice(player, squads.get(player.clubId) ?? [], fromTier, addDays(date, 1), market.eurBrl);
    return {
      id: player.id,
      name: player.name,
      group: player.group,
      age: player.age,
      strength: player.strength,
      clubId: free ? null : player.clubId,
      status: status === null && filters.status === "lendable" ? "lendable" : status,
      price: status === "onLoan" || status === "preContract" ? null : fee,
      wage: wageOf(player, free),
      value: Math.round(valuePlayer(player, fromTier, date) * market.eurBrl),
      currentWage: player.wage,
      contractUntil: player.contractUntil,
      willing: willingnessOf(player, free),
    };
  });
  return { total: found.length, rows };
}
