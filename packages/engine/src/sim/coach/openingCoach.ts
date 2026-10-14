import type { GameState } from "../gameState.js";
import { boardExpectations } from "./boardExpectations.js";
import { clubStatures } from "./clubStatures.js";
import { CAREER_START_REPUTATION, OFFER_REACH } from "./coach.js";
import { coachSalary } from "./coachSalary.js";
import { offerJobs } from "./offerJobs.js";
import { DEFAULT_TACTICS } from "./tactics.js";

// guess: a career starts with three small clubs to choose from.
const CAREER_OPENING_OFFERS = 3;

/**
 * The coach and the boards on day one. A chosen club gives the coach its stature as reputation and a
 * contract to the end of the season; career mode starts unknown, with offers from a few small clubs.
 */
export function openingCoach(state: Omit<GameState, "coach" | "boards">, careerMode: boolean, random: () => number): GameState {
  const coachClubId = careerMode ? null : state.coachClubId;
  const statures = clubStatures(state);
  const reputation = coachClubId ? (statures.get(coachClubId) ?? CAREER_START_REPUTATION) : CAREER_START_REPUTATION;
  const contract = coachClubId ? { salary: coachSalary(state, coachClubId), untilSeason: state.season } : null;
  const unset: GameState = { ...state, coachClubId, coach: { reputation, careerMode, contract, offers: [], tactics: DEFAULT_TACTICS }, boards: {} };
  const { boards } = boardExpectations(unset);
  const opened = { ...unset, boards };
  if (!careerMode) return opened;
  const reachable = [...statures].filter(([id, stature]) => id in boards && stature <= reputation + OFFER_REACH).map(([id]) => id).sort();
  const picks: string[] = [];
  while (picks.length < Math.min(CAREER_OPENING_OFFERS, reachable.length)) {
    const pick = reachable[Math.floor(random() * reachable.length)];
    if (pick && !picks.includes(pick)) picks.push(pick);
  }
  return offerJobs(opened, picks, random).state;
}
