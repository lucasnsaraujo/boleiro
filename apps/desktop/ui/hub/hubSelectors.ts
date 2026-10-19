import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import { isOnNeutralGround } from "@boleiro/engine/sim/continental/neutralGrounds";
import { boardConfidence, crowdPressure } from "@boleiro/engine/sim/coach/judgeCoaches";
import { clubMood } from "@boleiro/engine/sim/morale/clubMood";
import type { Fixture, GameState } from "@boleiro/engine/sim/gameState";
import type { Division } from "@boleiro/data/players";
import { fixtureLabel } from "@boleiro/game-client/format/competitionName";
import { groupTables } from "../tables/competitionTables.js";

/** The coach's next game; `isNeutral` a national team's game on neutral ground. */
export type NextMatch = { fixture: Fixture; opponentId: string; isHome: boolean; isNeutral: boolean; isToday: boolean; label: string };

/** The coach's next unplayed fixture from today on, his club's or his national team's, or null when he has none. */
export function nextMatch({ date, coachClubId, fixtures, competitions, nations }: Pick<GameState, "date" | "coachClubId" | "fixtures" | "competitions"> & Partial<Pick<GameState, "nations">>): NextMatch | null {
  // His club's or, when he runs one, his national team's.
  const sides = [coachClubId, nations?.job?.teamId].filter((id): id is string => id !== null && id !== undefined);
  let next: Fixture | null = null;
  for (const f of fixtures) {
    if (f.result || f.date < date || !sides.some((id) => f.homeId === id || f.awayId === id)) continue;
    if (!next || f.date < next.date) next = f;
  }
  if (!next) return null;
  const isHome = sides.includes(next.homeId);
  const competition = competitions[next.competitionId];
  return {
    fixture: next,
    opponentId: isHome ? next.awayId : next.homeId,
    isHome,
    isNeutral: competition?.kind === "national" && isOnNeutralGround(competition, next.stage),
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

export { boardConfidence };

/** The club panel's two meters, 0 to 100: the board's confidence in the coach and the fans' mood. */
export function clubMeters(state: Pick<GameState, "boards" | "mood">, clubId: string): { board: number; fans: number } {
  return {
    board: Math.round(100 * boardConfidence(state.boards[clubId], crowdPressure(state, clubId))),
    fans: Math.round(clubMood(state, clubId).fans),
  };
}

/** `division` null for a league abroad. */
export type LeagueStanding = { division: Division | null; position: number; points: number };

/** The name of the league abroad the coach's club plays in, or null for a club in Brazil's. */
export function leagueAbroadName({ coachClubId, competitions }: Pick<GameState, "coachClubId" | "competitions">): string | null {
  const league = Object.values(competitions).find((c) => c.kind === "league" && c.abroad && coachClubId !== null && c.clubIds.includes(coachClubId));
  return league?.kind === "league" && league.abroad ? league.abroad.name : null;
}

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
