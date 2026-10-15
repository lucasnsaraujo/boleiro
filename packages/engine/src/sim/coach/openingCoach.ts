import type { GameState } from "../gameState.js";
import { boardExpectations } from "./boardExpectations.js";
import { clubStatures } from "./clubStatures.js";
import { CAREER_START_REPUTATION, OFFER_REACH, type Coach } from "./coach.js";
import { coachSalary } from "./coachSalary.js";
import type { WaitingCoach } from "./humanCoaches.js";
import { offerJobs } from "./offerJobs.js";
import { DEFAULT_TACTICS } from "./tactics.js";

// guess: a career starts with three small clubs to choose from.
const CAREER_OPENING_OFFERS = 3;

/** A coach on day one at `clubId`, or unemployed with none: his contract to the end of the season and the club's usual formation. */
function hiredCoach(state: Omit<GameState, "coach" | "boards">, clubId: string | null, reputation: number): Coach {
  const contract = clubId ? { salary: coachSalary(state, clubId), untilSeason: state.season } : null;
  const formation = (clubId && state.usualLineups?.[clubId]?.formation) || DEFAULT_TACTICS.formation;
  return { reputation, careerMode: false, contract, offers: [], tactics: { ...DEFAULT_TACTICS, formation } };
}

/** A hot-seat game's other human coach on day one, waiting for his turn at the club he chose. */
export function openingWaitingCoach(state: GameState, name: string, clubId: string): WaitingCoach {
  const reputation = clubStatures(state).get(clubId) ?? CAREER_START_REPUTATION;
  const record = { stints: [{ clubId, from: state.date, until: null, left: null }], trophies: [], firings: [], seasons: [] };
  return { name, clubId, coach: hiredCoach(state, clubId, reputation), record };
}

/**
 * The coach and the boards on day one. A chosen club gives the coach its stature as reputation, a
 * contract to the end of the season and its usual formation; career mode starts unknown, with offers
 * from a few small clubs.
 */
export function openingCoach(state: Omit<GameState, "coach" | "boards">, careerMode: boolean, random: () => number): GameState {
  const coachClubId = careerMode ? null : state.coachClubId;
  const statures = clubStatures(state);
  const reputation = coachClubId ? (statures.get(coachClubId) ?? CAREER_START_REPUTATION) : CAREER_START_REPUTATION;
  const unset: GameState = { ...state, coachClubId, coach: { ...hiredCoach(state, coachClubId, reputation), careerMode }, boards: {} };
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
