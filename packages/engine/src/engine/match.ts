import type { Player, PositionGroup } from "@boleiro/data/players";
import { NO_SEND_OFFS, sendOffRates, type SendOffs } from "./sendOffRates.js";

export type { Player, PositionGroup };

export type Posture = "defensive" | "balanced" | "attacking";

/** `posture` and `penaltyTaker` left out play as a balanced side whose best forward takes penalties. */
export type Team = {
  name: string;
  players: Player[];
  posture?: Posture;
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
  const lineup: P[] = [];
  for (const [group, count] of Object.entries(FORMATION) as [PositionGroup, number][]) {
    lineup.push(...byStrength.filter((p) => p.group === group).slice(0, count));
  }
  const missing = 11 - lineup.length;
  if (missing > 0) {
    lineup.push(...byStrength.filter((p) => !lineup.includes(p)).slice(0, missing));
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

export function teamRatings(team: Team): { attack: number; defense: number } {
  const lineup = pickLineup(team.players);
  return {
    attack: weightedRating(lineup, { GK: 0, DEF: 0.5, MID: 1, ATT: 1.5 }),
    defense: weightedRating(lineup, { GK: 1.5, DEF: 1.5, MID: 1, ATT: 0.25 }),
  };
}

function saturate(gap: number, limit: number): number {
  return limit * Math.tanh(gap / limit);
}

function poisson(lambda: number, goals: number): number {
  let p = Math.exp(-lambda);
  for (let k = 1; k <= goals; k++) p *= lambda / k;
  return p;
}

function lowScoreAdjustment(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
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
// difference for a different spread of results.
const POSTURE: Record<Posture, { scoring: number; conceding: number }> = {
  defensive: { scoring: 0.8, conceding: 0.85 },
  balanced: { scoring: 1, conceding: 1 },
  attacking: { scoring: 1.15, conceding: 1.2 },
};

// 212 penalties in the 760 Série A matches of 2024 and 2025, 166 of them scored: ESPN's public
// match summaries (keyEvents "Penalty - Scored", "Saved", "Missed" and "Hit Woodwork").
const PENALTIES_PER_SIDE = 212 / 760 / 2;
const PENALTY_CONVERSION = 166 / 212;
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
  const homePosture = POSTURE[home.posture ?? "balanced"];
  const awayPosture = POSTURE[away.posture ?? "balanced"];
  const lh =
    rates.home * params.baseGoals * Math.exp(params.homeAdvantage + params.strengthImpact * saturate(h.attack - a.defense, params.gapSaturation)) *
      homePosture.scoring * awayPosture.conceding +
    rates.home * penaltyTakerGoals(home);
  const la =
    rates.away * params.baseGoals * Math.exp(params.strengthImpact * saturate(a.attack - h.defense, params.gapSaturation)) *
      awayPosture.scoring * homePosture.conceding +
    rates.away * penaltyTakerGoals(away);
  const grid: number[][] = [];
  let total = 0;
  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    const row: number[] = [];
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      const p = poisson(lh, hg) * poisson(la, ag) * lowScoreAdjustment(hg, ag, lh, la, params.lowScoreCorrelation);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  return { grid: grid.map((row) => row.map((p) => p / total)), lh, la };
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
