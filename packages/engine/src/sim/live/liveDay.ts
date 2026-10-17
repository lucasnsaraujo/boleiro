import type { Formation } from "../../engine/formations.js";
import type { EngineParams } from "../../engine/match.js";
import type { DayDecisions, DayEvent } from "../advanceDay.js";
import type { Tactics } from "../coach/tactics.js";
import type { CardRates } from "../discipline/cardRates.js";
import type { Discipline, PlayerDiscipline } from "../discipline/discipline.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import type { MatchContext } from "../players/effectiveStrength.js";
import type { MatchPlay } from "./matchPlay.js";
import type { MatchEvent } from "./matchTimeline.js";
import type { TalkEffect, TalkTone } from "./teamTalk.js";

/** One of today's matches as the live round shows it: who plays in which shape, and everything that happens, in order. */
export type LiveMatch = {
  fixtureId: string;
  homeId: string;
  awayId: string;
  formations: { home: Formation; away: Formation };
  events: MatchEvent[];
  /** Each player's form and play; missing in a match saved before players had a form of the day. */
  play?: MatchPlay;
};

/** What one played match adds to the day: its result, events, players' load, card records and team sheet. */
export type MatchOutcome = {
  fixture: Fixture;
  events: DayEvent[];
  players: SimPlayer[];
  /** Card records of the match's competition that the match changed, by player id. */
  discipline: Record<string, PlayerDiscipline>;
  sheet: MatchSheets[string];
};

/**
 * What a human coach's match needs to be redrawn after a change: the seated coach's, or in a
 * hot-seat game a waiting coach's. When two human coaches meet, one open match serves both.
 */
export type CoachMatch = {
  /** The club of the coach the match is open for; left out for the coach in the seat. */
  clubId?: string;
  fixtureId: string;
  context: MatchContext;
  awayTravelKm: number;
  params: EngineParams;
  cardRates: CardRates;
  starters: { home: SimPlayer[]; away: SimPlayer[] };
  /** The coach's players who may come on: fit, not suspended and not starting. */
  bench: SimPlayer[];
  /** Who the opponent may bring on; missing in a match saved before AI substitutions. */
  opponentBench?: SimPlayer[];
  /** When the opponent is another human coach, his tactics as of his last change; his side then gets no AI substitutions or posture. */
  rivalTactics?: Tactics;
  /** The strength each player who may take part plays at today, by player id. */
  strengths: Record<string, number>;
  /** The coach's tactics as of his last change. */
  tactics: Tactics;
  /** Each human coach's half-time talk in this match, by his club, with what it did; none before one is given. */
  halfTimeTalks?: Record<string, TalkEffect & { tone: TalkTone }>;
  lastChangeMinute: number;
  /** Redraws come from a stream of their own, so a change leaves every other match as it was. */
  rngState: number;
  /** The match as drawn at kick-off, used when the coach changes nothing. */
  kickOff: MatchOutcome;
  isChanged: boolean;
  /** Where the match's day events go among the others, so the day reads in fixture order. */
  eventsIndex: number;
};

/** The day's other matches, played and recorded, waiting for the coach's one. */
export type DayInProgress = {
  fixtures: Fixture[];
  events: DayEvent[];
  players: SimPlayer[];
  discipline: Discipline;
  sheets: MatchSheets;
  rngState: number;
};

/** A match day between kick-off and the final whistle. Plain data, so a worker can post it. */
export type LiveDay = {
  state: GameState;
  decisions: DayDecisions;
  matches: LiveMatch[];
  coachMatch: CoachMatch | null;
  /** The matches of a hot-seat game's waiting coaches, open like the seated coach's; none in a one-coach game. */
  waitingMatches?: CoachMatch[];
  rest: DayInProgress;
};
