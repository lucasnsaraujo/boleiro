import type { Division } from "@boleiro/data/players";
import type { PositionGroup } from "../../engine/match.js";
import { keyedStream, randomStream } from "../../engine/random.js";
import { divisionOf, tierOf } from "../finances/tierOf.js";
import type { ClubFinance, GameState, IsoDate, SimPlayer, Tier } from "../gameState.js";
import { wageRateOf, type WageRate } from "../transfers/wageDemand.js";
import type { Prospect } from "../youth/academy.js";
import { isHumanClub } from "../coach/humanCoaches.js";
import { inventName } from "./inventName.js";
import { marketOf, retirementChance, retirementWeight, type PlayerWantsToRetire } from "./retirement.js";
import { freshCondition, rollTrait } from "./openingProfile.js";
import { homeNationalityOf } from "./homeNationality.js";
import { squadsOfGame } from "./squadsByClub.js";
import { isClubFull } from "../transfers/squadCap.js";
import { projectedRevenue } from "../finances/setBoardBudget.js";

export type PlayerRetired = { type: "playerRetired"; playerId: string; clubId: string; name: string; age: number };
/** A kid moved up into his club's squad; `byAssistant` when a human coach's assistant did it for him mid-season. */
export type YouthPromoted = { type: "youthPromoted"; playerId: string; clubId: string; byAssistant?: true };

// Each division's level: the baselines new players are rated from (pipeline/rate_players.py DIVISION_PRIOR,
// data/SOURCES.md), 42 for clubs outside Série A–D. A club's players drift toward it, moved by the club's
// revenue (clubLevels).
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

// guess: each season a player closes 15% of the gap to his club's level for his age (clubLevels), so
// the clubs of a division keep the spread their revenue buys; a club that changes division rebuilds at
// once (rebuildMovedSquads).
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
// The 2026 Série A–D squads by position group (data/players.csv): 479 keepers, 1,455 defenders, 1,285
// midfielders and 1,093 forwards, the shape youth top-ups and the market keep a squad in.
export const SQUAD_SHAPE: Record<PositionGroup, number> = { GK: 479, DEF: 1455, MID: 1285, ATT: 1093 };
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

export function normal(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

const clamp = (strength: number) => Math.min(99, Math.max(1, strength));

// The 2026 squads' level (their players' mean strength net of age) rises 1.8 points for each e-fold of a
// club's revenue over its division's geometric mean (least squares within Série A–D, data/players.csv and
// data/finances.csv; 1.8, 1.8, 1.1 and 1.9 in each alone): money buys a better squad than the division's level.
const LEVEL_PER_LOG_REVENUE = 1.8;
// In their first season after the move, 2016–2026, clubs promoted to Série A, B and C took 1.14, 1.31 and
// 1.33 points a game, and clubs relegated to Série B and C 1.53 and 1.38 (ESPN's and Sofascore's results
// and divisions.csv in data/history, Série A's from its odds file); squads that kept their old level took
// 0.74, 0.84, 0.95, 1.93 and 1.95 in the game (six seeds' seasons 2–4). guess: a share of 0.85 takes them
// to 1.08, 1.11, 1.23, 1.50 and 1.52; a full rebuild fits promoted clubs a little better but sends more
// poor clubs from the estaduais up to Série C, below its revenue band, in ten-season runs.
const REBUILD_SHARE = 0.85;

// The yearly revenue the board budgets with, its members at the level they settle back to: membership moves
// with results at each monthly closing, so the turn of the year and the forecast on its eve read the same.
const logRevenueOf = (finance: ClubFinance | undefined): number | null =>
  finance ? Math.log(Math.max(1, projectedRevenue({ ...finance, membership: finance.membershipAnchor }))) : null;

/**
 * The level each club's players drift toward: its division's CLUB_LEVEL, moved by how the Brazilian
 * club's yearly revenue compares with its tier's geometric mean; a club abroad's is CLUB_LEVEL alone.
 */
function clubLevels(clubs: GameState["clubs"], finances: GameState["finances"]): (clubId: string) => number {
  const logs = new Map<Tier, number[]>();
  for (const club of Object.values(clubs)) {
    const x = club.abroad ? null : logRevenueOf(finances[club.id]);
    if (x !== null) logs.set(tierOf(club), [...(logs.get(tierOf(club)) ?? []), x]);
  }
  const means = new Map([...logs].map(([tier, xs]) => [tier, xs.reduce((sum, x) => sum + x, 0) / xs.length]));
  return (clubId) => {
    const club = clubs[clubId];
    const level = CLUB_LEVEL[(club && divisionOf(club)) ?? "none"];
    const x = club && !club.abroad ? logRevenueOf(finances[clubId]) : null;
    const mean = club ? means.get(tierOf(club)) : undefined;
    return x === null || mean === undefined ? level : level + LEVEL_PER_LOG_REVENUE * (x - mean);
  };
}

const levelsByFinances = new WeakMap<GameState["finances"], { clubs: GameState["clubs"]; levelOf: (clubId: string) => number }>();

// The level a player's strength drifts toward, by his club's division and revenue (see clubLevels).
function levelOf(state: GameState, clubId: string): number {
  let known = levelsByFinances.get(state.finances);
  if (known?.clubs !== state.clubs) {
    known = { clubs: state.clubs, levelOf: clubLevels(state.clubs, state.finances) };
    levelsByFinances.set(state.finances, known);
  }
  return known.levelOf(clubId);
}

/** A squad's level as CLUB_LEVEL counts it: its players' mean strength net of age. */
const standingOf = (squad: readonly SimPlayer[]): number => squad.reduce((sum, p) => sum + p.strength - ageOffset(p.age), 0) / Math.max(1, squad.length);

/**
 * The players of every AI club in Brazil that went up or down, moved `REBUILD_SHARE` of the way from where
 * the squad stands (its players' mean strength net of age) to the level its new division and revenue call
 * for (clubLevels): a real club rebuilds its squad over the summer when it changes division, far faster than
 * the market and the yearly pull move the game's. A squad moves only the way its club did. A human coach
 * rebuilds his own; clubs abroad keep theirs, as their result-only seasons do.
 */
export function rebuildMovedSquads(state: GameState, clubs: GameState["clubs"], finances: GameState["finances"]): GameState["players"] {
  const levelAfter = clubLevels(clubs, finances);
  // A loaned player belongs to the club that lent him, as his yearly drift does (targetOf).
  const ownerOf = (p: SimPlayer) => state.market.loans[p.id]?.fromClubId ?? p.clubId;
  const squads = new Map<string, SimPlayer[]>();
  for (const p of Object.values(state.players)) {
    const squad = squads.get(ownerOf(p));
    if (squad) squad.push(p);
    else squads.set(ownerOf(p), [p]);
  }
  const shifts = new Map<string, number>();
  for (const club of Object.values(clubs)) {
    const before = state.clubs[club.id];
    const squad = squads.get(club.id) ?? [];
    if (!before || club.abroad || squad.length === 0 || isHumanClub(state, club.id)) continue;
    const [from, to] = [CLUB_LEVEL[before.division ?? "none"], CLUB_LEVEL[club.division ?? "none"]];
    const shift = REBUILD_SHARE * (levelAfter(club.id) - standingOf(squad));
    if (from !== to && shift !== 0 && shift > 0 === to > from) shifts.set(club.id, shift);
  }
  if (shifts.size === 0) return state.players;
  return Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => {
      const shift = shifts.get(ownerOf(p));
      return [id, shift === undefined ? p : { ...p, strength: Math.round(clamp(p.strength + shift) * 10) / 10 }];
    }),
  );
}

/**
 * The strength a player drifts toward. A loaned player goes for minutes, not to settle at the
 * borrower's level: he drifts toward his own club's. An academy graduate grows toward his own
 * potential, reached at the peak age, when it beats his club's level.
 */
function targetOf(state: GameState, p: SimPlayer): number {
  const clubTarget = levelOf(state, state.market.loans[p.id]?.fromClubId ?? p.clubId) + ageOffset(p.age);
  return p.potential === undefined ? clubTarget : Math.max(clubTarget, p.potential + ageOffset(p.age) - ageOffset(PEAK_AGE));
}

/**
 * Each player's chance of stopping when the season turns: minutes and strength choose which of a
 * squad's veterans stop, the age table keeps how many it loses. Summed in id order, so the order the
 * squad comes in never moves a chance.
 */
function stopChances(state: GameState, squad: readonly SimPlayer[]): Map<string, number> {
  const ordered = [...squad].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const mostMinutes = Math.max(1, ...ordered.map((p) => p.condition.seasonMinutes));
  const weights = new Map(ordered.map((p) => [p.id, retirementWeight(p.condition.seasonMinutes / mostMinutes, p.strength - targetOf(state, p))]));
  const byAge = ordered.reduce((sum, p) => sum + retirementChance(p.age), 0);
  const weighted = ordered.reduce((sum, p) => sum + retirementChance(p.age) * (weights.get(p.id) ?? 1), 0);
  const keepVolume = weighted > 0 ? byAge / weighted : 1;
  return new Map(ordered.map((p) => [p.id, Math.min(1, retirementChance(p.age) * (weights.get(p.id) ?? 1) * keepVolume)]));
}

const RETIREMENT_STREAM_SALT = 0x7e71e;

/**
 * What a player does when `state.season` turns: a human coach's player whose announced last season
 * ends retires, and so does anyone else whose own roll, keyed to the save's seed, the season and him,
 * falls under his chance of stopping; a human coach's veteran who rolls it announces his last season
 * instead, and keeps his word unless talked round.
 */
function seasonTurnOf(state: GameState, player: SimPlayer, chance: number): "retires" | "announces" | "plays on" {
  if (player.retiring && player.retiring.afterSeason <= state.season) return "retires";
  if (chance === 0 || keyedStream(state.seed ^ RETIREMENT_STREAM_SALT, `${state.season}/${player.id}`)() >= chance) return "plays on";
  if (!isHumanClub(state, player.clubId)) return "retires";
  return player.retiring ? "plays on" : "announces";
}

/**
 * Whether he retires when `state.season` turns, decided in advance so the clubs talking contracts on
 * the season's last day already know who stops that night.
 */
export function retiresAtSeasonTurn(state: GameState, player: SimPlayer): boolean {
  if (!player.retiring && retirementChance(player.age) === 0) return false;
  const squad = [...(squadsOfGame(state).get(player.clubId) ?? []).filter((p) => p.id !== player.id), player];
  return seasonTurnOf(state, player, stopChances(state, squad).get(player.id) ?? 0) === "retires";
}

/**
 * The position groups a squad adds from its academy: `leaving` replaced one for one, then the
 * thinnest groups (against the 2026 squads' shape) until it has 18 players. A squad left without a
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

/** A teenager with an invented name from the club's academy, of its country's `nationality`, rated for its division; the caller sets his wage. */
export function academyPlayer(
  id: string,
  clubId: string,
  division: Division | null,
  group: PositionGroup,
  date: IsoDate,
  random: () => number,
  nationality: string,
): Omit<SimPlayer, "wage"> {
  const age = YOUTH_MIN_AGE + Math.floor(random() * YOUTH_AGES);
  const strength = clamp(CLUB_LEVEL[division ?? "none"] + ageOffset(age) + YOUTH_SD * normal(random));
  return {
    id, clubId, group, age, name: inventName(random),
    strength: Math.round(strength * 10) / 10,
    nationalities: [nationality],
    trait: rollTrait(random),
    contractUntil: `${Number(date.slice(0, 4)) + YOUTH_CONTRACT_YEARS - 1}-12-31`,
    condition: freshCondition(date),
  };
}

/** An academy kid as a professional at `clubId` on a first contract at `wage`, of his academy's country's `nationality`; he keeps his hidden potential. */
export function professionalOf(prospect: Prospect, clubId: string, wage: number, date: IsoDate, random: () => number, nationality: string): SimPlayer {
  return {
    id: prospect.id,
    clubId,
    name: prospect.name,
    group: prospect.group,
    strength: prospect.strength,
    potential: prospect.potential,
    age: prospect.age,
    nationalities: [nationality],
    trait: rollTrait(random),
    contractUntil: `${Number(date.slice(0, 4)) + YOUTH_CONTRACT_YEARS - 1}-12-31`,
    condition: freshCondition(date),
    wage,
  };
}

/**
 * The academy's best teenager at `group` old enough for the squad, if the club would keep him (`isKept`);
 * its 20-year-olds finish their last youth year.
 */
export function readyProspect(academy: readonly Prospect[], group: PositionGroup, taken: ReadonlySet<string>, isKept: (kid: Prospect) => boolean): Prospect | null {
  let best: Prospect | null = null;
  for (const p of academy) {
    if (taken.has(p.id) || p.group !== group || p.age < YOUTH_MIN_AGE || p.age >= YOUTH_MIN_AGE + YOUTH_AGES) continue;
    if (!best || p.strength > best.strength || (p.strength === best.strength && p.id < best.id)) best = p;
  }
  return best && isKept(best) ? best : null;
}

// guess: a club keeps a kid who plays within 4 points of the middle of its squad at his position.
const FIT_MARGIN = 4;

/** Whether the kid plays near the middle of `squad` at his position. */
export function isNearSquadMiddle(prospect: Pick<Prospect, "group" | "strength">, squad: readonly SimPlayer[]): boolean {
  const rivals = squad.filter((p) => p.group === prospect.group).map((p) => p.strength).sort((a, b) => a - b);
  const middle = rivals[rivals.length >> 1];
  return middle === undefined || prospect.strength >= middle - FIT_MARGIN;
}

/** Whether the club with `squad` would keep the kid: there is room and he plays near the middle of its squad at his position. */
export function isWorthPromoting(state: GameState, prospect: Prospect, squad: readonly SimPlayer[]): boolean {
  return !isClubFull(state, prospect.clubId, squad.length) && isNearSquadMiddle(prospect, squad);
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
 * higher); veterans retire, sooner when they barely played or fell below their club's level, and a
 * human coach's veterans announce their last season instead; the academy's best teenagers at each
 * position replace them and fill any squad below 18, at an AI club only those who play near the middle
 * of its squad (isNearSquadMiddle), and Brazilian teenagers with invented names at the club's level stand
 * in where the academy has nobody ready (or no academy at all). Runs on the first day of the new year,
 * before promotions and relegations, so each academy produces players for the division it played in.
 */
export function developPlayers(state: GameState): { state: GameState; events: (PlayerRetired | PlayerWantsToRetire | YouthPromoted)[] } {
  const random = randomStream(state.rngState);
  const events: (PlayerRetired | PlayerWantsToRetire | YouthPromoted)[] = [];
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
    const chances = stopChances(state, squad);
    for (const p of squad) {
      const { seasonMinutes, seasonPoints } = p.condition;
      const minutes = MINUTES_EFFECT * (seasonMinutes / mostMinutes - averageShare);
      const form = seasonMinutes >= FORM_MIN_MINUTES ? FORM_EFFECT * ((seasonPoints * 90) / seasonMinutes - AVERAGE_POINTS_PER_GAME) : 0;
      const target = targetOf(state, p);
      const drift = ageOffset(p.age + 1) - ageOffset(p.age) + PULL_TO_CLUB_LEVEL * (target - p.strength);
      const strength = clamp(p.strength + drift + minutes + form + SEASON_NOISE_SD * normal(random.next));
      const turn = seasonTurnOf(state, p, chances.get(p.id) ?? 0);
      if (turn === "retires") {
        events.push({ type: "playerRetired", playerId: p.id, clubId, name: p.name, age: p.age });
        continue;
      }
      const condition = { ...p.condition, seasonMinutes: 0, seasonPoints: 0 };
      const developed = { ...p, age: p.age + 1, strength: Math.round(strength * 10) / 10, condition };
      if (turn === "announces") {
        const afterSeason = state.season + 1;
        players[p.id] = { ...developed, retiring: { afterSeason, hasBeenAsked: false } };
        events.push({ type: "playerWantsToRetire", playerId: p.id, clubId, name: p.name, age: developed.age, afterSeason });
        continue;
      }
      players[p.id] = developed;
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
    const squadNow = staying.flatMap((p) => players[p.id] ?? []);
    const isHuman = isHumanClub(state, club.id);
    groupsToFill(staying, retiredGroups).forEach((group, i) => {
      const prospect = readyProspect(academies.get(club.id) ?? [], group, taken, (kid) => isHuman || isNearSquadMiddle(kid, squadNow));
      if (prospect) taken.add(prospect.id);
      const youth = prospect
        ? professionalOf(prospect, club.id, 0, date, random.next, homeNationalityOf(club))
        : academyPlayer(`y${intake}-${club.id}-${i}`, club.id, divisionOf(club), group, date, random.next, homeNationalityOf(club));
      const newcomer = { ...youth, wage: Math.max(1, rate(youth.strength)) };
      players[youth.id] = newcomer;
      squadNow.push(newcomer);
      events.push({ type: "youthPromoted", playerId: youth.id, clubId: club.id });
    });
  }
  const market = marketOf(state.market, (id) => id in players);
  const youth = state.youth && { ...state.youth, prospects: Object.fromEntries(Object.entries(prospects).filter(([id]) => !taken.has(id))) };
  return { state: { ...state, players, market, ...(youth ? { youth } : {}), rngState: random.state() }, events };
}
