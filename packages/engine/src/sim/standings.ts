import type { CardCount } from "./discipline/discipline.js";
import type { Fixture } from "./gameState.js";

export type StandingRow = {
  clubId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  redCards: number;
  yellowCards: number;
};

/** What the table reads of a match. */
type PlayedMatch = Pick<Fixture, "homeId" | "awayId" | "result">;

const emptyRow = (clubId: string): StandingRow => ({
  clubId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, redCards: 0, yellowCards: 0,
});

function record(row: StandingRow, scored: number, conceded: number, cards: CardCount | undefined): void {
  row.played++;
  row.redCards += cards?.reds ?? 0;
  row.yellowCards += cards?.yellows ?? 0;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) row.wins++;
  else if (scored === conceded) row.draws++;
  else row.losses++;
  row.points = row.wins * 3 + row.draws;
}

function table(clubIds: readonly string[], fixtures: readonly PlayedMatch[]): Map<string, StandingRow> {
  const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]));
  for (const { homeId, awayId, result } of fixtures) {
    if (!result) continue;
    const home = rows.get(homeId);
    const away = rows.get(awayId);
    if (home) record(home, result.homeGoals, result.awayGoals, result.cards?.home);
    if (away) record(away, result.awayGoals, result.homeGoals, result.cards?.away);
  }
  return rows;
}

const byOverall = (a: StandingRow, b: StandingRow): number =>
  b.points - a.points || b.wins - a.wins || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;

function headToHead(a: string, b: string, fixtures: readonly PlayedMatch[]): number {
  const direct = fixtures.filter((f) => (f.homeId === a && f.awayId === b) || (f.homeId === b && f.awayId === a));
  const rows = table([a, b], direct);
  const rowA = rows.get(a);
  const rowB = rows.get(b);
  return rowA && rowB ? byOverall(rowA, rowB) : 0;
}

// Tie-break order of the CBF Brasileirão 2026 specific rules, as reported by Band
// (https://www.band.com.br/esportes/brasileirao-criterios-desempate) and TecMundo
// (https://www.tecmundo.com.br/apostas/409831-brasileirao-2026-formato-datas-vagas-para-libertadores-e-sul-americana.htm):
// points, wins, goal difference, goals scored, head-to-head (only between two clubs),
// fewest red cards, fewest yellow cards, draw (`drawOrder`, a seeded shuffle made when the
// competition starts). A second yellow counts as a red only.
export function standings(clubIds: readonly string[], fixtures: readonly PlayedMatch[], drawOrder: readonly string[]): StandingRow[] {
  const draw = new Map(drawOrder.map((id, index) => [id, index]));
  const byDraw = (a: StandingRow, b: StandingRow) => (draw.get(a.clubId) ?? 0) - (draw.get(b.clubId) ?? 0);
  const byCards = (a: StandingRow, b: StandingRow) => a.redCards - b.redCards || a.yellowCards - b.yellowCards;
  const sorted = [...table(clubIds, fixtures).values()].sort((a, b) => byOverall(a, b) || byCards(a, b) || byDraw(a, b));
  const ranked: StandingRow[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start + 1;
    while (end < sorted.length && byOverall(sorted[start] as StandingRow, sorted[end] as StandingRow) === 0) end++;
    const level = sorted.slice(start, end);
    const [first, second] = level;
    if (level.length === 2 && first && second) {
      level.sort((a, b) => headToHead(a.clubId, b.clubId, fixtures) || byCards(a, b) || byDraw(a, b));
    }
    ranked.push(...level);
    start = end;
  }
  return ranked;
}
