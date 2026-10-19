import type { Lane, Player, PositionGroup } from "@boleiro/data/players";
import { NO_SEND_OFFS, sendOffRates, type SendOffs } from "./sendOffRates.js";
import { exp, tanh } from "../sim/portableMath.js";

export type { Lane, Player, PositionGroup };

/** How far a side comes out: `defensive` parks the bus, `counter` sits deep and breaks. */
export type Posture = "defensive" | "counter" | "balanced" | "attacking";
/** How hard a side marks: the heavier, the fewer chances its opponent gets and the more cards it takes. */
export type Marking = "light" | "heavy" | "veryHeavy";
/** Where a side builds its attacks: through the middle or down the flanks. */
export type Play = "middle" | "flanks";

/**
 * `posture`, `marking` and `penaltyTaker` left out play as a balanced, heavy-marking side whose best
 * forward takes penalties. `play` left out, or a side not placed in a formation, mixes both ways.
 */
export type Team = {
  name: string;
  players: Player[];
  posture?: Posture;
  marking?: Marking;
  play?: Play;
  penaltyTaker?: Player;
};

export type MatchOdds = {
  home: number;
  draw: number;
  away: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
};

export type Score = {
  homeGoals: number;
  awayGoals: number;
};

export type EngineParams = {
  baseGoals: number;
  homeAdvantage: number;
  strengthImpact: number;
  gapSaturation: number;
  lowScoreCorrelation: number;
};

export const CALIBRATED: EngineParams = {
  baseGoals: 0.9509,
  homeAdvantage: 0.3627,
  strengthImpact: 0.0843,
  gapSaturation: 15,
  lowScoreCorrelation: -0.0855,
};

export const FORMATION: Record<PositionGroup, number> = { GK: 1, DEF: 4, MID: 4, ATT: 2 };
const MAX_GOALS = 10;

export function pickLineup<P extends Player>(players: readonly P[]): P[] {
  const byStrength = [...players].sort((a, b) => b.strength - a.strength);
  // One walk down the squad fills each group's places, strongest first.
  const placed: Record<PositionGroup, P[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of byStrength) if (placed[p.group].length < FORMATION[p.group]) placed[p.group].push(p);
  const lineup = (Object.keys(FORMATION) as PositionGroup[]).flatMap((group) => placed[group]);
  const missing = 11 - lineup.length;
  if (missing > 0) {
    const picked = new Set(lineup);
    lineup.push(...byStrength.filter((p) => !picked.has(p)).slice(0, missing));
  }
  return lineup;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// guess: no study rates players away from their position. An outfielder plays another outfield
// position at 85% of his strength; a keeper outfield, or an outfielder in goal, at half. A player
// placed by position (formations.ts) carries his `fit` instead.
export const OUT_OF_POSITION = 0.85;
export const KEEPER_SWAP = 0.5;

function slotStrength(player: Player, slot: PositionGroup): number {
  if (player.fit !== undefined) return player.strength * player.fit;
  if (slot === player.group) return player.strength;
  return player.strength * (slot === "GK" || player.group === "GK" ? KEEPER_SWAP : OUT_OF_POSITION);
}

function weightedRating(lineup: Player[], weights: Record<PositionGroup, number>): number {
  let total = 0;
  let weightSum = 0;
  for (const player of lineup) {
    const slot = player.slot ?? player.group;
    total += slotStrength(player, slot) * weights[slot];
    weightSum += weights[slot];
  }
  return weightSum ? total / weightSum : average(lineup.map((p) => p.strength));
}

const ATTACK_WEIGHTS: Record<PositionGroup, number> = { GK: 0, DEF: 0.5, MID: 1, ATT: 1.5 };
const DEFENSE_WEIGHTS: Record<PositionGroup, number> = { GK: 1.5, DEF: 1.5, MID: 1, ATT: 0.25 };

export function teamRatings(team: Team): { attack: number; defense: number } {
  const lineup = pickLineup(team.players);
  return {
    attack: weightedRating(lineup, ATTACK_WEIGHTS),
    defense: weightedRating(lineup, DEFENSE_WEIGHTS),
  };
}

/** One third of the pitch as one side attacks down it: its attack there against the defence the other side has there, and the best player of each. */
export type LaneDuel = { lane: Lane; attack: number; defense: number; attacker: Player | null; defender: Player | null };

const LANES: readonly Lane[] = ["left", "centre", "right"];
// Attacking down your left, you meet the defenders on their right.
const FACING: Record<Lane, Lane> = { left: "right", centre: "centre", right: "left" };

/** The players of one lane, rated with `weights` and the keeper left out; the side's whole rating when nobody stands there. */
function laneRating(players: readonly Player[], weights: Record<PositionGroup, number>, whole: number): { rating: number; best: Player | null } {
  let total = 0;
  let weightSum = 0;
  let best: Player | null = null;
  let bestWorth = 0;
  for (const player of players) {
    const slot = player.slot ?? player.group;
    const weight = slot === "GK" ? 0 : weights[slot];
    const strength = slotStrength(player, slot);
    total += strength * weight;
    weightSum += weight;
    if (weight > 0 && strength * weight > bestWorth) {
      best = player;
      bestWorth = strength * weight;
    }
  }
  return { rating: weightSum ? total / weightSum : whole, best };
}

/** Left, centre and right as `attacking` attacks `defending`; null unless both sides stand in a formation. */
export function laneDuels(attacking: Team, defending: Team): LaneDuel[] | null {
  if (!attacking.players.length || !defending.players.length) return null;
  if (![...attacking.players, ...defending.players].every((p) => p.lane)) return null;
  const whole = { attack: teamRatings(attacking).attack, defense: teamRatings(defending).defense };
  return LANES.map((lane) => {
    const attack = laneRating(attacking.players.filter((p) => p.lane === lane), ATTACK_WEIGHTS, whole.attack);
    const defense = laneRating(defending.players.filter((p) => p.lane === FACING[lane]), DEFENSE_WEIGHTS, whole.defense);
    return { lane, attack: attack.rating, defense: defense.rating, attacker: attack.best, defender: defense.best };
  });
}

/** How many points a side's attack beats the defence it meets through the middle and down the flanks (the two flanks' mean). */
export function playEdges(duels: readonly LaneDuel[]): Record<Play, number> {
  const edge = (lane: Lane) => {
    const duel = duels.find((d) => d.lane === lane);
    return duel ? duel.attack - duel.defense : 0;
  };
  return { middle: edge("centre"), flanks: (edge("left") + edge("right")) / 2 };
}

function saturate(gap: number, limit: number): number {
  return limit * tanh(gap / limit);
}

function poisson(lambda: number, goals: number): number {
  let p = exp(-lambda);
  for (let k = 1; k <= goals; k++) p *= lambda / k;
  return p;
}

// A strong low-score correlation pushes a factor below zero once a side expects more than 1/|rho| goals; that score
// then gets no chance instead of a negative one, the bound Dixon and Coles put on the correlation.
function lowScoreAdjustment(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return Math.max(0, 1 - lh * la * rho);
  if (h === 0 && a === 1) return Math.max(0, 1 + lh * rho);
  if (h === 1 && a === 0) return Math.max(0, 1 + la * rho);
  if (h === 1 && a === 1) return Math.max(0, 1 - rho);
  return 1;
}

const STARTERS = 11;

/** A side that can't field eleven plays short from kick-off, exactly as if the missing men were sent off at minute 0. */
function withMissingPlayers(home: Team, away: Team, sendOffs: SendOffs): SendOffs {
  const kickOff = (team: Team) => Array.from({ length: Math.max(0, STARTERS - team.players.length) }, () => 0);
  return { home: [...kickOff(home), ...sendOffs.home], away: [...kickOff(away), ...sendOffs.away] };
}

// guess: no study puts a number on a coach's posture. An attacking side creates 15% more and
// allows 20% more, a defensive one creates 20% less and allows 15% less: each trades goal
// difference for a different spread of results. A side on the counter creates 8% less and allows
// 10% less, and breaks 10% better into the space a side that attacks leaves.
const POSTURE: Record<Posture, { scoring: number; conceding: number }> = {
  defensive: { scoring: 0.8, conceding: 0.85 },
  counter: { scoring: 0.92, conceding: 0.9 },
  balanced: { scoring: 1, conceding: 1 },
  attacking: { scoring: 1.15, conceding: 1.2 },
};
const COUNTER_INTO_SPACE = 1.1;

// guess: no public rate ties marking to chances or cards. Heavy marking is what the real card rates
// already show; light marking allows 6% more and takes 30% fewer cards, very heavy allows 6% less and takes 45% more.
const MARKING: Record<Marking, { opponentScoring: number; cards: number }> = {
  light: { opponentScoring: 1.06, cards: 0.7 },
  heavy: { opponentScoring: 1, cards: 1 },
  veryHeavy: { opponentScoring: 0.94, cards: 1.45 },
};

/** How much a side's marking scales its own card rates. */
export function markingCards(marking: Marking | undefined): number {
  return MARKING[marking ?? "heavy"].cards;
}

// guess: each point the chosen way's edge has over the other way's is worth 1% of the side's
// chances, up to 6%; a side that mixes both ways plays at the calibrated rate.
const PLAY_PER_POINT = 0.01;
const MAX_PLAY_POINTS = 6;

/** How much where a side builds its attacks scales its chances against this defence. */
function playFactor(team: Team, opponent: Team): number {
  if (!team.play) return 1;
  const duels = laneDuels(team, opponent);
  if (!duels) return 1;
  const edges = playEdges(duels);
  const gain = edges[team.play] - edges[team.play === "middle" ? "flanks" : "middle"];
  return 1 + PLAY_PER_POINT * Math.max(-MAX_PLAY_POINTS, Math.min(MAX_PLAY_POINTS, gain));
}

/** A side's scoring rate against `opponent` scaled by its posture, the opponent's posture and marking, and where it builds. */
function withTactics(rate: number, team: Team, opponent: Team): number {
  const own = team.posture ?? "balanced";
  const other = opponent.posture ?? "balanced";
  const intoSpace = own === "counter" && other === "attacking" ? COUNTER_INTO_SPACE : 1;
  return rate * POSTURE[own].scoring * POSTURE[other].conceding * intoSpace * MARKING[opponent.marking ?? "heavy"].opponentScoring * playFactor(team, opponent);
}

// 212 penalties in the 760 Série A matches of 2024 and 2025, 166 of them scored: ESPN's public
// match summaries (keyEvents "Penalty - Scored", "Saved", "Missed" and "Hit Woodwork").
export const PENALTIES_PER_SIDE = 212 / 760 / 2;
export const PENALTY_CONVERSION = 166 / 212;
// guess: each strength point a taker has over the side's best forward adds a point of conversion,
// kept between 60% and 95%.
const CONVERSION_PER_POINT = 0.01;
const MIN_CONVERSION = 0.6;
const MAX_CONVERSION = 0.95;

/** The usual taker: the strongest forward, else the strongest outfielder. */
function usualTaker(players: readonly Player[]): Player | undefined {
  const byStrength = [...players].sort((a, b) => b.strength - a.strength);
  return byStrength.find((p) => p.group === "ATT") ?? byStrength.find((p) => p.group !== "GK") ?? byStrength[0];
}

/** Goals per match a chosen penalty taker adds, or costs, over the usual one. */
function penaltyTakerGoals(team: Team): number {
  const usual = team.penaltyTaker && usualTaker(team.players);
  if (!team.penaltyTaker || !usual) return 0;
  const conversion = (strength: number) =>
    Math.min(MAX_CONVERSION, Math.max(MIN_CONVERSION, PENALTY_CONVERSION + CONVERSION_PER_POINT * (strength - usual.strength)));
  return PENALTIES_PER_SIDE * (conversion(team.penaltyTaker.strength) - conversion(usual.strength));
}

function scoreGrid(home: Team, away: Team, params: EngineParams, sendOffs: SendOffs): { grid: number[][]; lh: number; la: number } {
  const h = teamRatings(home);
  const a = teamRatings(away);
  const rates = sendOffRates(withMissingPlayers(home, away, sendOffs));
  const lh =
    withTactics(rates.home * params.baseGoals * exp(params.homeAdvantage + params.strengthImpact * saturate(h.attack - a.defense, params.gapSaturation)), home, away) +
    rates.home * penaltyTakerGoals(home);
  const la =
    withTactics(rates.away * params.baseGoals * exp(params.strengthImpact * saturate(a.attack - h.defense, params.gapSaturation)), away, home) +
    rates.away * penaltyTakerGoals(away);
  // Every match of the game draws from a grid: each side's goal chances are worked out once, not per cell.
  const homeChances = Array.from({ length: MAX_GOALS + 1 }, (_, goals) => poisson(lh, goals));
  const awayChances = Array.from({ length: MAX_GOALS + 1 }, (_, goals) => poisson(la, goals));
  const grid: number[][] = [];
  let total = 0;
  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    const row: number[] = [];
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      const p = (homeChances[hg] ?? 0) * (awayChances[ag] ?? 0) * lowScoreAdjustment(hg, ag, lh, la, params.lowScoreCorrelation);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  for (const row of grid) row.forEach((p, ag) => (row[ag] = p / total));
  return { grid, lh, la };
}

/** Probability of each final score: [home goals][away goals], up to MAX_GOALS (10) each. */
export function scoreDistribution(home: Team, away: Team, params: EngineParams = CALIBRATED, sendOffs: SendOffs = NO_SEND_OFFS): number[][] {
  return scoreGrid(home, away, params, sendOffs).grid;
}

export function matchOdds(home: Team, away: Team, params: EngineParams = CALIBRATED, sendOffs: SendOffs = NO_SEND_OFFS): MatchOdds {
  const { grid, lh, la } = scoreGrid(home, away, params, sendOffs);
  const odds = { home: 0, draw: 0, away: 0, expectedHomeGoals: lh, expectedAwayGoals: la };
  grid.forEach((row, hg) =>
    row.forEach((p, ag) => {
      if (hg > ag) odds.home += p;
      else if (hg === ag) odds.draw += p;
      else odds.away += p;
    }),
  );
  return odds;
}

/** One final score drawn from the score distribution; `sendOffs` are drawn by the caller before kick-off. */
export function simulateMatch(
  home: Team,
  away: Team,
  random: () => number,
  params: EngineParams = CALIBRATED,
  sendOffs: SendOffs = NO_SEND_OFFS,
): Score {
  const { grid } = scoreGrid(home, away, params, sendOffs);
  let roll = random();
  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      roll -= grid[hg]?.[ag] ?? 0;
      if (roll <= 0) return { homeGoals: hg, awayGoals: ag };
    }
  }
  return { homeGoals: MAX_GOALS, awayGoals: MAX_GOALS };
}

// Extra time scores a little below normal time's rate: the men's World Cups of 1986 to 2022, leaving out
// 1998's and 2002's golden goal, had 34 goals in 45 extra times, 0.0252 a minute, against 0.0270 a minute
// in their 476 matches' ninety minutes (Joshua C. Fjelstul, The Fjelstul World Cup Database, matches.csv
// and goals.csv, https://github.com/jfjelstul/worldcup).
const EXTRA_TIME_RATE = 0.0252 / 0.027;
const EXTRA_TIME_MINUTES = 30;
const MATCH_MINUTES = 90;

/** Each side's expected goals over the thirty minutes of extra time; players sent off in the ninety minutes are missing from its start. */
export function extraTimeExpectedGoals(home: Team, away: Team, params: EngineParams = CALIBRATED, sentOff: SendOffs = NO_SEND_OFFS): { home: number; away: number } {
  const fromStart = { home: sentOff.home.map(() => 0), away: sentOff.away.map(() => 0) };
  const odds = matchOdds(home, away, params, fromStart);
  const share = (EXTRA_TIME_MINUTES / MATCH_MINUTES) * EXTRA_TIME_RATE;
  return { home: odds.expectedHomeGoals * share, away: odds.expectedAwayGoals * share };
}

function poissonDraw(mean: number, random: () => number): number {
  let roll = random();
  let p = exp(-mean);
  let count = 0;
  while (roll > p && count < MAX_GOALS) {
    roll -= p;
    count++;
    p *= mean / count;
  }
  return count;
}

/** Extra time's goals, drawn for each side from its expected goals. */
export function simulateExtraTime(home: Team, away: Team, random: () => number, params: EngineParams = CALIBRATED, sentOff: SendOffs = NO_SEND_OFFS): Score {
  const expected = extraTimeExpectedGoals(home, away, params, sentOff);
  return { homeGoals: poissonDraw(expected.home, random), awayGoals: poissonDraw(expected.away, random) };
}
