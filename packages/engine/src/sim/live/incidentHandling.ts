import { isHumanClub } from "../coach/humanCoaches.js";
import { humanNationalTeamIds } from "../nations/nationalFixtures.js";
import type { Fixture, GameState } from "../gameState.js";
import { isFinal } from "../rivalries/coachRivalries.js";

/**
 * How a side's red cards and injuries are answered during a match: its human coach decides in a window
 * (unless his match plan answered first), his match plan alone does under the house rule outside a
 * final, or its AI coach's substitutions do.
 */
export type IncidentHandling = "askCoach" | "matchPlan" | "aiSubstitutions";

/**
 * Whether the house rule "manual changes only in finals" leaves this match to the coaches' match plans.
 * A final is any match of a competition's last knockout stage, both legs when it has two: the same final
 * coach rivalries count.
 */
export function isLockedToPlans(state: Pick<GameState, "manualChangesOnlyInFinals" | "competitions">, fixture: Pick<Fixture, "competitionId" | "stage">): boolean {
  return state.manualChangesOnlyInFinals === true && !isFinal(state, fixture);
}

/**
 * Who answers a club's red cards and injuries in a match. Every substitution path routes through
 * here: the live round opens its window only on "askCoach", and kick-off plays AI substitutions
 * for "aiSubstitutions". Every human coach is asked, the one in the seat and those of a hot-seat
 * game waiting for their turn, for his club and his national team, except in a match (`fixture`) the
 * house rule leaves to their plans.
 */
export function incidentHandling(
  state: Pick<GameState, "coachClubId" | "waitingCoaches" | "manualChangesOnlyInFinals" | "competitions" | "nations">,
  clubId: string,
  fixture?: Pick<Fixture, "competitionId" | "stage">,
): IncidentHandling {
  if (!isHumanClub(state, clubId) && !humanNationalTeamIds(state).includes(clubId)) return "aiSubstitutions";
  return fixture && isLockedToPlans(state, fixture) ? "matchPlan" : "askCoach";
}
