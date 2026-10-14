import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import type { Fixture, GameState } from "@boleiro/engine/sim/gameState";
import { fixtureLabel } from "@boleiro/game-client/format/competitionName";

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

/** The coach's job security in one word, from his board's pressure. */
export function jobSecurity(board: Board | undefined): JobSecurity {
  if (!board) return "Estável";
  return SECURITY_STEPS.find((step) => board.pressure < step.below)?.word ?? "Ameaçado";
}
