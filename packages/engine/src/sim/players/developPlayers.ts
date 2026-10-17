import type { Division } from "@boleiro/data/players";
import type { PositionGroup } from "../../engine/match.js";
import { keyedStream, randomStream } from "../../engine/random.js";
import { divisionOf, tierOf } from "../finances/tierOf.js";
import type { GameState, IsoDate, SimPlayer, Tier } from "../gameState.js";
import { wageRateOf, type WageRate } from "../transfers/wageDemand.js";
import type { Prospect } from "../youth/academy.js";
import { inventName } from "./inventName.js";
import { freshCondition, rollTrait } from "./openingProfile.js";

export type PlayerRetired = { type: "playerRetired"; playerId: string; clubId: string; name: string; age: number };
export type YouthPromoted = { type: "youthPromoted"; playerId: string; clubId: string };

// The level a club's players drift toward: the division baselines new players are rated from
// (pipeline/rate_players.py DIVISION_PRIOR, data/SOURCES.md), 42 for clubs outside Série A–D.
export const CLUB_LEVEL: Record<Division | "none", number> = { A: 72, B: 63, C: 56, D: 49, none: 42 };

/**
 * Strength by age relative to the club level. Piecewise linear through the 2026 squads' mean
 * strength by age within each division (data/players.csv): about 4 below at 17, peak 1 above from
 * 27 to 31, back to 4 below at 38. The peak window agrees with Dendir 2016, "When do soccer
 * players peak?", J Sports Analytics 2(2):89–105 (peak 25–27, flat to about 30).
 */
const PEAK_AGE = 27;
const AGE_CURVE: readonly [age: number, offset: number][] = [[17, -4], [27, 1], [31, 1], [38, -4], [45, -11]];

function ageOffset(age: number): number {
  const first = AGE_CURVE[0];
  if (!first || age <= first[0]) return first?.[1] ?? 0;
  for (let i = 1; i < AGE_CURVE.length; i++) {
    const [a0, o0] = AGE_CURVE[i - 1] ?? first;
    const [a1, o1] = AGE_CURVE[i] ?? first;
    if (age <= a1) return o0 + ((o1 - o0) * (age - a0)) / (a1 - a0);
  }
  const [lastAge, lastOffset] = AGE_CURVE.at(-1) ?? first;
  return lastOffset - (age - lastAge);
}

// guess: each season a player closes 15% of the gap to his club's level for his age, so promoted
// clubs' players rise over a few seasons and the spread within a division stays put.
const PULL_TO_CLUB_LEVEL = 0.15;
// guess: yearly ups and downs nobody can predict, in strength points (one standard deviation).
// With the pull above it keeps a spread of about 1.5 / √(1 − 0.85²) ≈ 2.8 around the age curve,
// close to the 2026 squads' within-division spread once the curve's own spread is added.
const SEASON_NOISE_SD = 1.5;
// guess: strength points for playing every minute of the club's season instead of the squad's
// average share. Zero-sum within each squad.
const MINUTES_EFFECT = 1;
// guess: strength points per league point per game above 1.35, the average of a league where a
// quarter of games are drawn; counts only for players with at least five full games.
const FORM_EFFECT = 0.5;
const AVERAGE_POINTS_PER_GAME = 1.35;
const FORM_MIN_MINUTES = 450;

/**
 * Chance of leaving the game at the end of a season by age. Smoothed from how much smaller each
 * age group is than the one a year younger in the 2026 squads (data/players.csv: 350 aged 28,
 * 345, 312, 295, 216, 247 at 33, 226, 149 at 35, 136, 113, 79, 41 at 39, 41, 12 at 41): about 6%
 * a year from 29 (players dropping out of professional squads), rising to 70% past 40.
 */
const RETIREMENT: readonly [minAge: number, chance: number][] = [
  [40, 0.7], [39, 0.55], [38, 0.45], [37, 0.3], [36, 0.25], [35, 0.2], [34, 0.15], [33, 0.08], [29, 0.06],
];

// The 2026 squads have 24 players a club on average (data/players.csv). guess: no club drops
// below 18, enough for an eleven plus injuries and rotation.
export const MIN_SQUAD = 18;
const YOUTH_MIN_AGE = 17;
// guess: a youth player in a division with nobody to compare wages with earns about the 2026
// national minimum wage, R$1,621 a month.
export const NO_SQUAD_WAGE = 1621;
const YOUTH_AGES = 3;
// guess: a first professional contract runs three seasons (Lei 14.597/2023 allows up to five).
export const YOUTH_CONTRACT_YEARS = 3;
// guess: spread of a new youth player's strength around his club's level for his age, a little
// above the 2026 squads' 18–19 year-olds (about 3 points within a division).
const YOUTH_SD = 3;
// guess: share of each position group in a squad when topping one up (3 keepers in 24).
export const SQUAD_SHAPE: Record<PositionGroup, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

export function normal(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

const clamp = (strength: number) => Math.min(99, Math.max(1, strength));

function retirementChance(age: number): number {
  return RETIREMENT.find(([minAge]) => age >= minAge)?.[1] ?? 0;
}

const RETIREMENT_STREAM_SALT = 0x7e71e;

/**
 * Whether he retires when `state.season` turns. The roll is his own, keyed to the save's seed, the season
 * and him, so the clubs talking contracts on the season's last day already know who stops that night.
 */
export function retiresAtSeasonTurn(state: Pick<GameState, "seed" | "season">, player: Pick<SimPlayer, "id" | "age">): boolean {
  return keyedStream(state.seed ^ RETIREMENT_STREAM_SALT, `${state.season}/${player.id}`)() < retirementChance(player.age);
}

/**
 * The position groups a squad adds from its academy: `leaving` replaced one for one, then the
 * thinnest groups (against a 24-man squad's shape) until it has 18 players. A squad left without a
 * keeper always promotes one, since nobody else may play in goal.
 */
export function groupsToFill(staying: readonly Pick<SimPlayer, "group">[], leaving: readonly PositionGroup[]): PositionGroup[] {
  const counts = new Map<PositionGroup, number>();
  for (const p of [...staying, ...leaving.map((group) => ({ group }))]) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
  const neediest = (): PositionGroup =>
    GROUPS.reduce((a, b) =>
      (counts.get(a) ?? 0) / SQUAD_SHAPE[a] <= (counts.get(b) ?? 0) / SQUAD_SHAPE[b] ? a : b);
  const groups = [...leaving];
  if (!counts.get("GK")) {
    groups.push("GK");
    counts.set("GK", 1);
  }
  while (staying.length + groups.length < MIN_SQUAD) {
    const group = neediest();
    groups.push(group);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return groups;
}

/** A Brazilian teenager with an invented name from the club's academy, rated for its division; the caller sets his wage. */
export function academyPlayer(
  id: string,
  clubId: string,
  division: Division | null,
  group: PositionGroup,
  date: IsoDate,
  random: () => number,
): Omit<SimPlayer, "wage"> {
  const age = YOUTH_MIN_AGE + Math.floor(random() * YOUTH_AGES);
  const strength = clamp(CLUB_LEVEL[division ?? "none"] + ageOffset(age) + YOUTH_SD * normal(random));
  return {
    id, clubId, group, age, name: inventName(random),
    strength: Math.round(strength * 10) / 10,
    nationalities: ["Brazil"],
    trait: rollTrait(random),
    contractUntil: `${Number(date.slice(0, 4)) + YOUTH_CONTRACT_YEARS - 1}-12-31`,
    condition: freshCondition(date),
  };
}

/** An academy kid as a professional at `clubId` on a first contract at `wage`; he keeps his hidden potential. */
export function professionalOf(prospect: Prospect, clubId: string, wage: number, date: IsoDate, random: () => number): SimPlayer {
  return {
    id: prospect.id,
    clubId,
    name: prospect.name,
    group: prospect.group,
    strength: prospect.strength,
    potential: prospect.potential,
    age: prospect.age,
    nationalities: ["Brazil"],
    trait: rollTrait(random),
    contractUntil: `${Number(date.slice(0, 4)) + YOUTH_CONTRACT_YEARS - 1}-12-31`,
    condition: freshCondition(date),
    wage,
  };
}

/** The academy's best teenager at `group` old enough for the squad, if any; its 20-year-olds finish their last youth year. */
export function readyProspect(academy: readonly Prospect[], group: PositionGroup, taken: ReadonlySet<string>): Prospect | null {
  let best: Prospect | null = null;
  for (const p of academy) {
    if (taken.has(p.id) || p.group !== group || p.age < YOUTH_MIN_AGE || p.age >= YOUTH_MIN_AGE + YOUTH_AGES) continue;
    if (!best || p.strength > best.strength || (p.strength === best.strength && p.id < best.id)) best = p;
  }
  return best;
}

/** What each tier pays for a given strength, from the wages of everyone playing in it. */
function tierWageRates(clubs: GameState["clubs"], players: readonly SimPlayer[]): (tier: Tier) => WageRate {
  const byTier = new Map<Tier, SimPlayer[]>();
  for (const p of players) {
    const club = clubs[p.clubId];
    if (!club) continue;
    const squad = byTier.get(tierOf(club)) ?? [];
    squad.push(p);
    byTier.set(tierOf(club), squad);
  }
  const rates = new Map([...byTier].map(([tier, squad]) => [tier, wageRateOf(squad)]));
  return (tier) => rates.get(tier) ?? (() => NO_SQUAD_WAGE);
}

/**
 * The end-of-season turnover of every squad: each player ages a year and his strength drifts
 * with age, minutes and form toward his club's level (an academy graduate toward his potential, when
 * higher); veterans retire; the academy's best teenagers at each position replace them and fill any squad
 * below 18, and Brazilian teenagers with invented names stand in where the academy has nobody (a club
 * without one). Runs on the first day of the new year,
 * before promotions and relegations, so each academy produces players for the division it played in.
 */
export function developPlayers(state: GameState): { state: GameState; events: (PlayerRetired | YouthPromoted)[] } {
  const random = randomStream(state.rngState);
  const events: (PlayerRetired | YouthPromoted)[] = [];
  const levelOf = (clubId: string) => {
    const club = state.clubs[clubId];
    return CLUB_LEVEL[(club && divisionOf(club)) ?? "none"];
  };
  const squads = new Map<string, SimPlayer[]>();
  for (const p of Object.values(state.players)) {
    const squad = squads.get(p.clubId) ?? [];
    squad.push(p);
    squads.set(p.clubId, squad);
  }

  const players: Record<string, SimPlayer> = {};
  for (const [clubId, squad] of squads) {
    const mostMinutes = Math.max(1, ...squad.map((p) => p.condition.seasonMinutes));
    const averageShare = squad.reduce((sum, p) => sum + p.condition.seasonMinutes / mostMinutes, 0) / squad.length;
    for (const p of squad) {
      const { seasonMinutes, seasonPoints } = p.condition;
      const minutes = MINUTES_EFFECT * (seasonMinutes / mostMinutes - averageShare);
      const form = seasonMinutes >= FORM_MIN_MINUTES ? FORM_EFFECT * ((seasonPoints * 90) / seasonMinutes - AVERAGE_POINTS_PER_GAME) : 0;
      // A loaned player goes for minutes, not to settle at the borrower's level: he drifts toward his own club's.
      const clubTarget = levelOf(state.market.loans[p.id]?.fromClubId ?? clubId) + ageOffset(p.age);
      // An academy graduate grows toward his own potential, reached at the peak age, when it beats his club's level.
      const target = p.potential === undefined ? clubTarget : Math.max(clubTarget, p.potential + ageOffset(p.age) - ageOffset(PEAK_AGE));
      const drift = ageOffset(p.age + 1) - ageOffset(p.age) + PULL_TO_CLUB_LEVEL * (target - p.strength);
      const strength = clamp(p.strength + drift + minutes + form + SEASON_NOISE_SD * normal(random.next));
      if (retiresAtSeasonTurn(state, p)) {
        events.push({ type: "playerRetired", playerId: p.id, clubId, name: p.name, age: p.age });
        continue;
      }
      const condition = { ...p.condition, seasonMinutes: 0, seasonPoints: 0 };
      players[p.id] = { ...p, age: p.age + 1, strength: Math.round(strength * 10) / 10, condition };
    }
  }

  const { date } = state;
  const intake = date.slice(0, 4);
  // A squad short of players takes its academy's best kids at each position first.
  const prospects = state.youth?.prospects ?? {};
  const taken = new Set<string>();
  const academies = new Map<string, Prospect[]>();
  for (const p of Object.values(prospects)) academies.set(p.clubId, [...(academies.get(p.clubId) ?? []), p]);
  // guess: a first contract pays the division's going rate for the youngster's strength, so a thin
  // club's few remaining big earners don't set every newcomer's wage.
  const wageRate = tierWageRates(state.clubs, Object.values(players));
  for (const club of Object.values(state.clubs)) {
    const squad = squads.get(club.id) ?? [];
    const staying = squad.filter((p) => players[p.id]);
    const retiredGroups = squad.filter((p) => !players[p.id]).map((p) => p.group);
    const rate = wageRate(tierOf(club));
    groupsToFill(staying, retiredGroups).forEach((group, i) => {
      const prospect = readyProspect(academies.get(club.id) ?? [], group, taken);
      if (prospect) taken.add(prospect.id);
      const youth = prospect
        ? professionalOf(prospect, club.id, 0, date, random.next)
        : academyPlayer(`y${intake}-${club.id}-${i}`, club.id, divisionOf(club), group, date, random.next);
      players[youth.id] = { ...youth, wage: Math.max(1, rate(youth.strength)) };
      events.push({ type: "youthPromoted", playerId: youth.id, clubId: club.id });
    });
  }
  // A retired player's pre-contract and loan go with him.
  const stillPlaying = <T>(byPlayer: Record<string, T>) => Object.fromEntries(Object.entries(byPlayer).filter(([id]) => players[id]));
  const market = { ...state.market, preContracts: stillPlaying(state.market.preContracts), loans: stillPlaying(state.market.loans) };
  const youth = state.youth && { ...state.youth, prospects: Object.fromEntries(Object.entries(prospects).filter(([id]) => !taken.has(id))) };
  return { state: { ...state, players, market, ...(youth ? { youth } : {}), rngState: random.state() }, events };
}
