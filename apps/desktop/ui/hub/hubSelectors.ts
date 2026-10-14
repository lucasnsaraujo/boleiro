import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import type { Fixture, GameState } from "@boleiro/engine/sim/gameState";
import type { Division } from "@boleiro/data/players";
import { fixtureLabel } from "@boleiro/game-client/format/competitionName";
import { groupTables } from "../tables/competitionTables.js";

export type NextMatch = { fixture: Fixture; opponentId: string; isHome: boolean; isToday: boolean; label: string };

/** The coach's next unplayed fixture from today on, or null without a club or a known fixture. */
export function nextMatch({ date, coachClubId, fixtures, competitions }: Pick<GameState, "date" | "coachClubId" | "fixtures" | "competitions">): NextMatch | null {
  if (!coachClubId) return null;
  let next: Fixture | null = null;
  for (const f of fixtures) {
    if (f.result || f.date < date || (f.homeId !== coachClubId && f.awayId !== coachClubId)) continue;
    if (!next || f.date < next.date) next = f;
  }
  if (!next) return null;
  const isHome = next.homeId === coachClubId;
  const competition = competitions[next.competitionId];
  return {
    fixture: next,
    opponentId: isHome ? next.awayId : next.homeId,
    isHome,
    isToday: next.date === date,
    label: competition ? fixtureLabel(competition, next) : "",
  };
}

export type JobSecurity = "Prestigiado" | "Estável" | "Pressionado" | "Ameaçado";

// guess: steps on the board's rolling pressure (0 is on target, 1 a quarter of the table short).
// judgeCoaches starts firing past 0.8 with the crowd added, so "Ameaçado" begins short of that.
const SECURITY_STEPS: readonly { below: number; word: JobSecurity }[] = [
  { below: -0.25, word: "Prestigiado" },
  { below: 0.25, word: "Estável" },
  { below: 0.6, word: "Pressionado" },
];

/** How full the board's meter on the hub is, 0 to 1: half on target, emptying as the pressure grows. */
export function boardConfidence(board: Board | undefined): number {
  return Math.min(1, Math.max(0, (1 - (board?.pressure ?? 0)) / 2));
}

export type LeagueStanding = { division: Division; position: number; points: number };

/** The coach's club in its national league's first phase, once it has played a game of it. */
export function leagueStanding({ coachClubId, competitions, fixtures }: Pick<GameState, "coachClubId" | "competitions" | "fixtures">): LeagueStanding | null {
  if (!coachClubId) return null;
  const league = Object.values(competitions).find((c) => c.kind === "league" && c.clubIds.includes(coachClubId));
  if (league?.kind !== "league") return null;
  const table = groupTables(league, 0, fixtures).groups.flatMap((group) => group.rows);
  const row = table.find((r) => r.clubId === coachClubId);
  return row && row.played > 0 ? { division: league.division, position: row.position, points: row.points } : null;
}

/** The coach's job security in one word, from his board's pressure. */
export function jobSecurity(board: Board | undefined): JobSecurity {
  if (!board) return "Estável";
  return SECURITY_STEPS.find((step) => board.pressure < step.below)?.word ?? "Ameaçado";
}
