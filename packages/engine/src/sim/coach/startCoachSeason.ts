import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { boardExpectations, type BoardExpectationsSet, type Expectation } from "./boardExpectations.js";
import { clubStatures } from "./clubStatures.js";
import { GAP_SCALE } from "./judgeCoaches.js";
import { offerJobs, type JobOffered } from "./offerJobs.js";
import { asWaitingCoach, isHumanClub, waitingCoachesOf } from "./humanCoaches.js";
import { recordCoachEvents } from "../history/recordDayEvents.js";
import { turnsOnItsOwn } from "../world/turnSeasonsAbroad.js";

export type CoachSeasonReviewed = {
  type: "coachSeasonReviewed";
  clubId: string;
  season: number;
  expectation: Expectation;
  targetPosition: number;
  position: number;
  won: boolean;
  promoted: boolean;
  reputation: number;
};
export type ContractRenewed = { type: "contractRenewed"; clubId: string; untilSeason: number };
export type ContractEnded = { type: "contractEnded"; clubId: string; season: number };
export type CoachSeasonEvent = CoachSeasonReviewed | ContractRenewed | ContractEnded | BoardExpectationsSet | JobOffered;

// guess: reputation points per quarter of the table above (or below) the target.
const REPUTATION_PER_GAP = 5;
// guess: reputation points for a league title or a promotion.
const TROPHY_REPUTATION = 8;
// guess: a season at a club bigger than his name closes a fifth of the gap, whatever the result.
const STATURE_PULL = 0.2;
// 30% of Série A clubs changed coach between the end of the 2024 season and the start of 2025
// (Jornal de Brasília, https://jornaldebrasilia.com.br/torcida/30-dos-clubes-da-serie-a-trocaram-de-tecnico-para-2025/).
const PRESEASON_CHANGE_CHANCE = 0.3;

/** Whether the club plays in a full-tier league abroad whose season runs on past Brazil's turn of the year. */
function isMidSeasonAbroad(state: GameState, clubId: string): boolean {
  const country = state.clubs[clubId]?.abroad?.country;
  const found = country ? state.world?.[country] : undefined;
  return found !== undefined && turnsOnItsOwn(found);
}

/**
 * Reviews the player's coach on the season just ended: reputation, then his contract. A coach at a club
 * abroad whose season runs on past Brazil's turn of the year is reviewed at his country's own turn
 * (`isOwnTurn`, reviewCoachesAbroad) instead.
 */
function reviewCoach(state: GameState, outcomes: readonly LeagueOutcome[], isOwnTurn = false): { state: GameState; events: CoachSeasonEvent[] } {
  const clubId = state.coachClubId;
  const board = clubId ? state.boards[clubId] : undefined;
  const { contract } = state.coach;
  if (!clubId || !contract || (!isOwnTurn && isMidSeasonAbroad(state, clubId))) return { state, events: [] };
  const events: CoachSeasonEvent[] = [];
  let coach = state.coach;
  let coachClubId: string | null = clubId;
  if (board) {
    const won = outcomes.some((o) => o.championId === clubId);
    const promoted = outcomes.some((o) => o.promotedIds.includes(clubId));
    const gap = (GAP_SCALE * (board.targetPosition - board.position)) / board.tableSize;
    const pull = STATURE_PULL * Math.max(0, (clubStatures(state).get(clubId) ?? 0) - coach.reputation);
    const change = REPUTATION_PER_GAP * gap + (won || promoted ? TROPHY_REPUTATION : 0) + pull;
    const reputation = Math.round(Math.min(100, Math.max(0, coach.reputation + change)));
    coach = { ...coach, reputation };
    const { expectation, targetPosition, position } = board;
    events.push({ type: "coachSeasonReviewed", clubId, season: state.season - 1, expectation, targetPosition, position, won, promoted, reputation });
  }
  if (contract.untilSeason < state.season) {
    const metTarget = board !== undefined && board.position <= board.targetPosition;
    if (metTarget) {
      coach = { ...coach, contract: { ...contract, untilSeason: state.season } };
      events.push({ type: "contractRenewed", clubId, untilSeason: state.season });
    } else {
      coach = { ...coach, contract: null };
      coachClubId = null;
      events.push({ type: "contractEnded", clubId, season: state.season - 1 });
    }
  }
  return { state: { ...state, coach, coachClubId }, events };
}

/**
 * The coach career at the turn of the year, after the new season's competitions open: the player's
 * coach is reviewed, every board sets its expectations, and pre-season coach changes open jobs
 * (`vacancies`, the clubs that let their coach go).
 */
export function startCoachSeason(
  state: GameState,
  outcomes: readonly LeagueOutcome[],
  random: () => number,
): { state: GameState; events: CoachSeasonEvent[]; waitingEvents: CoachSeasonEvent[][]; vacancies: string[] } {
  const reviewed = reviewCoach(state, outcomes);
  // A waiting hot-seat coach is reviewed as the one in the seat is, against the season just ended, before the boards set new targets.
  let next = reviewed.state;
  const waitingEvents: CoachSeasonEvent[][] = [];
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    const own = asWaitingCoach(next, index, (seated) => {
      const review = reviewCoach(seated, outcomes);
      return { state: recordCoachEvents(review.state, review.events, addDays(seated.date, -1)), events: review.events };
    });
    next = own.state;
    waitingEvents.push(own.events);
  }
  const set = boardExpectations(next);
  // A league abroad whose season crosses the new year keeps its boards to its own turn (turnSeasonsAbroad).
  const kept = Object.fromEntries(Object.entries(next.boards).filter(([id]) => isMidSeasonAbroad(next, id)));
  const boards = { ...set.boards, ...kept };
  const vacancies = Object.keys(boards).sort().filter((id) => !(id in kept) && !isHumanClub(next, id) && random() < PRESEASON_CHANGE_CHANCE);
  const offered = offerJobs({ ...next, boards }, vacancies, random);
  next = offered.state;
  // ...and hears of the open jobs as he does.
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    const own = asWaitingCoach(next, index, (seated) => {
      const offers = offerJobs(seated, vacancies, random);
      return { state: recordCoachEvents(offers.state, offers.events, addDays(seated.date, -1)), events: offers.events };
    });
    next = own.state;
    waitingEvents[index]?.push(...own.events);
  }
  const setEvents = set.events.filter((event) => !(event.clubId in kept));
  return { state: next, events: [...reviewed.events, ...setEvents, ...offered.events], waitingEvents, vacancies };
}

/**
 * The human coaches at a full-tier country's clubs reviewed at its own turn of the season
 * (turnSeasonsAbroad) on its leagues' `outcomes`, as Brazil's coaches are at the turn of the year; a
 * waiting coach's events go into his own record.
 */
export function reviewCoachesAbroad(state: GameState, country: string, outcomes: readonly LeagueOutcome[]): { state: GameState; events: CoachSeasonEvent[] } {
  const review = (seated: GameState) =>
    seated.coachClubId !== null && seated.clubs[seated.coachClubId]?.abroad?.country === country ? reviewCoach(seated, outcomes, true) : { state: seated, events: [] };
  const own = review(state);
  let next = own.state;
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    next = asWaitingCoach(next, index, (seated) => {
      const reviewed = review(seated);
      return { state: recordCoachEvents(reviewed.state, reviewed.events, addDays(seated.date, -1)), events: reviewed.events };
    }).state;
  }
  return { state: next, events: own.events };
}
