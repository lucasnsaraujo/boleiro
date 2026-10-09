export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

export type Player = {
  name: string;
  group: PositionGroup;
  strength: number;
};

export type Team = {
  name: string;
  players: Player[];
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

export function pickLineup(players: Player[]): Player[] {
  const byStrength = [...players].sort((a, b) => b.strength - a.strength);
  const lineup: Player[] = [];
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

function weightedRating(lineup: Player[], weights: Record<PositionGroup, number>): number {
  let total = 0;
  let weightSum = 0;
  for (const player of lineup) {
    total += player.strength * weights[player.group];
    weightSum += weights[player.group];
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

function scoreGrid(home: Team, away: Team, params: EngineParams): { grid: number[][]; lh: number; la: number } {
  const h = teamRatings(home);
  const a = teamRatings(away);
  const lh = params.baseGoals * Math.exp(params.homeAdvantage + params.strengthImpact * saturate(h.attack - a.defense, params.gapSaturation));
  const la = params.baseGoals * Math.exp(params.strengthImpact * saturate(a.attack - h.defense, params.gapSaturation));
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
export function scoreDistribution(home: Team, away: Team, params: EngineParams = CALIBRATED): number[][] {
  return scoreGrid(home, away, params).grid;
}

export function matchOdds(home: Team, away: Team, params: EngineParams = CALIBRATED): MatchOdds {
  const { grid, lh, la } = scoreGrid(home, away, params);
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

export function simulateMatch(home: Team, away: Team, random: () => number, params: EngineParams = CALIBRATED): Score {
  const { grid } = scoreGrid(home, away, params);
  let roll = random();
  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      roll -= grid[hg]?.[ag] ?? 0;
      if (roll <= 0) return { homeGoals: hg, awayGoals: ag };
    }
  }
  return { homeGoals: MAX_GOALS, awayGoals: MAX_GOALS };
}
