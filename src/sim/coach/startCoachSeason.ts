import type { GameState } from "../gameState.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { boardExpectations, type BoardExpectationsSet, type Expectation } from "./boardExpectations.js";
import { clubStatures } from "./clubStatures.js";
import { GAP_SCALE } from "./judgeCoaches.js";
import { offerJobs, type JobOffered } from "./offerJobs.js";

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

/** Reviews the player's coach on the season just ended: reputation, then his contract. */
function reviewCoach(state: GameState, outcomes: readonly LeagueOutcome[]): { state: GameState; events: CoachSeasonEvent[] } {
  const clubId = state.coachClubId;
  const board = clubId ? state.boards[clubId] : undefined;
  const { contract } = state.coach;
  if (!clubId || !contract) return { state, events: [] };
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
 * coach is reviewed, every board sets its expectations, and pre-season coach changes open jobs.
 */
export function startCoachSeason(state: GameState, outcomes: readonly LeagueOutcome[], random: () => number): { state: GameState; events: CoachSeasonEvent[] } {
  const reviewed = reviewCoach(state, outcomes);
  const set = boardExpectations(reviewed.state);
  const next = { ...reviewed.state, boards: set.boards };
  const vacancies = Object.keys(set.boards).sort().filter((id) => id !== next.coachClubId && random() < PRESEASON_CHANGE_CHANCE);
  const offered = offerJobs(next, vacancies, random);
  return { state: offered.state, events: [...reviewed.events, ...set.events, ...offered.events] };
}
