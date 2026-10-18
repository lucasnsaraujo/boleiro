/**
 * FIFA's men's ranking, "SUM" since 2018: P = P_before + I × (W − W_e), W_e = 1 / (10^(−dr/600) + 1), where W is
 * 1 for a win, 0.5 for a draw, 0 for a loss, a shootout winner 0.75 and its loser 0.5; I is the match's
 * importance; a side knocked out in a final tournament's knockout stage loses no points
 * (https://inside.fifa.com/fifa-world-ranking/procedure-men).
 */
export type NationalCompetitionKind = "world-cup" | "continental-cup" | "nations-league" | "qualifiers" | "friendlies";

const KNOCKOUT_FROM_QUARTERS = new Set(["quarter-finals", "semi-finals", "third-place", "final"]);

/** A match's importance: friendlies in a window 10, Nations League 15 (25 in its finals), qualifiers 25, a continental final tournament 35 (40 from the quarter-finals), the World Cup 50 (60 from the quarter-finals). */
export function matchImportance(kind: NationalCompetitionKind, round: string): number {
  const late = KNOCKOUT_FROM_QUARTERS.has(round);
  if (kind === "world-cup") return late ? 60 : 50;
  if (kind === "continental-cup") return late ? 40 : 35;
  if (kind === "nations-league") return round === "group" ? 15 : 25;
  if (kind === "qualifiers") return 25;
  return 10;
}

type Sides<T> = { home: T; away: T };

/** Both sides' points after a match of `importance`; `isKnockout` for a final tournament's knockout stage, where the loser keeps his. */
export function rankingPointsAfter(points: Sides<number>, score: Sides<number> & { penaltyWinner?: "home" | "away" }, importance: number, isKnockout: boolean): Sides<number> {
  const expectedHome = 1 / (10 ** (-(points.home - points.away) / 600) + 1);
  const resultHome = score.home > score.away ? 1 : score.home < score.away ? 0 : score.penaltyWinner === "home" ? 0.75 : score.penaltyWinner === "away" ? 0.5 : 0.5;
  const resultAway = score.penaltyWinner ? (score.penaltyWinner === "away" ? 0.75 : 0.5) : 1 - resultHome;
  let home = importance * (resultHome - expectedHome);
  let away = importance * (resultAway - (1 - expectedHome));
  if (isKnockout) {
    home = Math.max(0, home);
    away = Math.max(0, away);
  }
  return { home: round2(points.home + home), away: round2(points.away + away) };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
