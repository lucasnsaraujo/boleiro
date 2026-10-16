import type { Division } from "@boleiro/data/players";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import { addDays } from "@boleiro/engine/sim/dates";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { squadsByClub } from "@boleiro/engine/sim/players/squadsByClub";
import { sellerPrice } from "@boleiro/engine/sim/transfers/askingPrice";
import { valuePlayer } from "@boleiro/engine/sim/transfers/valuePlayer";
import { isInPreContractWindow } from "@boleiro/engine/sim/transfers/tradeBetweenClubs";
import { nextWindowOpensOn, windowClosesOn, type CoachWindows } from "@boleiro/engine/sim/transfers/transferWindows";
import { wageDemandAt, wageRateOf } from "@boleiro/engine/sim/transfers/wageDemand";
import { willingToJoin } from "@boleiro/engine/sim/transfers/willingToJoin";
import { isLendable, lineupsOf } from "@boleiro/game-client/market/coachRequests";
import type { MarketFilters, MarketStatus } from "@boleiro/game-client/market/marketFilters";

/** A row's status: the filterable ones, or why he can't be bought. */
export type RowStatus = MarketStatus | "onLoan" | "preContract" | null;
export type Willingness = "yes" | "maybe" | "no";

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

export type MarketState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "market" | "history">;

/** A filter's choice as the market's selects list it. */
export type FilterOption<T extends string> = { value: T; label: string; group?: string };

// guess: above 60% the coach can count on a yes, under 35% he shouldn't.
const SURE_YES = 0.6;
const LIKELY_NO = 0.35;

// Every player the full tier holds plays in Brazil; the other countries are played result-only, without players to sign.
const COUNTRY = "Brasil";
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const leagueName = (division: Division) => `Série ${division}`;

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * The coach's transfer window today: open until a date, or closed until the game's next opening. `isOwn`
 * marks a window he got for himself on taking a club outside the game's. Left out, the rules are a game's
 * usual windows.
 */
export function windowStatus(date: IsoDate, rules: CoachWindows = { coach: {} }): { isOpen: boolean; date: IsoDate; isOwn?: true } {
  const closes = windowClosesOn(rules, date);
  if (!closes) return { isOpen: false, date: nextWindowOpensOn(rules, date) };
  return windowClosesOn({ ...rules, coach: {} }, date) ? { isOpen: true, date: closes } : { isOpen: true, date: closes, isOwn: true };
}

/** The leagues whose players are on the market, grouped by country. */
export function marketLeagues(state: Pick<GameState, "clubs">): FilterOption<Division>[] {
  const played = new Set(Object.values(state.clubs).map((club) => club.division));
  return DIVISIONS.filter((division) => played.has(division)).map((division) => ({ value: division, label: leagueName(division), group: COUNTRY }));
}

/** The other clubs of a league, or of every league grouped by it, by name. */
export function marketClubs(state: Pick<GameState, "clubs" | "coachClubId">, division: Division | null): FilterOption<string>[] {
  return Object.values(state.clubs)
    .filter((club) => club.id !== state.coachClubId && club.division !== null && (!division || club.division === division))
    .sort((a, b) => (a.division ?? "").localeCompare(b.division ?? "") || a.shortName.localeCompare(b.shortName, "pt-BR"))
    .map((club) => ({ value: club.id, label: club.shortName, group: division || !club.division ? undefined : leagueName(club.division) }));
}

// The data names countries in English, Transfermarkt's way; the language's own region names give most of them in
// Portuguese, through their codes. These are the names Transfermarkt spells its own way, or that have no region code.
const TRANSFERMARKT_NAMES: Record<string, string> = {
  England: "Inglaterra",
  Scotland: "Escócia",
  Wales: "País de Gales",
  "Northern Ireland": "Irlanda do Norte",
  "Korea, South": "Coreia do Sul",
  "Cote d'Ivoire": "Costa do Marfim",
  "DR Congo": "RD Congo",
  "Sao Tome and Principe": "São Tomé e Príncipe",
  "St. Vincent & Grenadinen": "São Vicente e Granadinas",
};
const REGION_CODES = Array.from({ length: 26 * 26 }, (_, i) => String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)));
let portugueseNames: Map<string, string> | null = null;

function inPortuguese(country: string): string {
  if (!portugueseNames) {
    const english = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    const portuguese = new Intl.DisplayNames(["pt-BR"], { type: "region", fallback: "none" });
    portugueseNames = new Map(REGION_CODES.flatMap((code) => {
      const from = english.of(code);
      const to = portuguese.of(code);
      return from && to ? [[from, to] as const] : [];
    }));
  }
  return TRANSFERMARKT_NAMES[country] ?? portugueseNames.get(country) ?? country;
}

/** The nationalities among other clubs' players and free agents, named in Portuguese, alphabetically. */
export function marketNationalities(state: Pick<GameState, "coachClubId" | "players" | "market">): FilterOption<string>[] {
  const found = new Set<string>();
  for (const player of Object.values(state.players)) if (player.clubId !== state.coachClubId) for (const n of player.nationalities) found.add(n);
  for (const player of Object.values(state.market.freeAgents)) for (const n of player.nationalities) found.add(n);
  // The data's "N/A", split at its slash like a second nationality, leaves single letters.
  return [...found]
    .filter((value) => value.length > 1).map((value) => ({ value, label: inPortuguese(value) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
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

  const goalsByCompetition = Object.values(state.history.current.goals);
  const seasonGoals = (playerId: string) => goalsByCompetition.reduce((sum, byPlayer) => sum + (byPlayer[playerId] ?? 0), 0);

  const matches = (player: SimPlayer, free: boolean): boolean => {
    const strength = Math.round(player.strength);
    if (filters.nationality && !player.nationalities.includes(filters.nationality)) return false;
    // A free agent keeps the minutes of the season he was released in, which may be long gone.
    if (filters.minMinutes !== null && (free ? 0 : player.condition.seasonMinutes) < filters.minMinutes) return false;
    if (filters.minGoals !== null && seasonGoals(player.id) < filters.minGoals) return false;
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
