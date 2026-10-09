import type { Club } from "../data/clubs.js";
import type { Division } from "../data/players.js";
import type { Player } from "../engine/match.js";

export type IsoDate = string;

export type SimPlayer = Player & { id: string; clubId: string };

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
  penaltyWinnerId?: string;
};

export type Fixture = {
  id: string;
  competitionId: string;
  stage: number;
  date: IsoDate;
  homeId: string;
  awayId: string;
  group?: number;
  tie?: number;
  result: MatchResult | null;
};

export type GroupStage = {
  kind: "groups";
  groups: string[][];
  legs: 1 | 2;
  dates: IsoDate[];
};

export type KnockoutStage = {
  kind: "knockout";
  ties: [string, string][];
  dates: IsoDate[];
};

export type Stage = GroupStage | KnockoutStage;

export type LeagueFormatId = `serie-${Lowercase<Division>}`;

export type LeagueCompetition = {
  id: string;
  kind: "league";
  format: LeagueFormatId;
  division: Division;
  season: number;
  clubIds: string[];
  stages: Stage[];
  stageDates: IsoDate[][];
  drawOrder: string[];
};

export type Competition = LeagueCompetition;

export type SeasonCalendar = {
  season: number;
  stateChampionshipDates: IsoDate[];
  copaDoBrasilRounds: { name: string; dates: IsoDate[] }[];
  leagueDates: Record<Division, IsoDate[]>;
};

export type GameState = {
  version: 1;
  seed: number;
  rngState: number;
  date: IsoDate;
  season: number;
  coachClubId: string | null;
  clubs: Record<string, Club>;
  players: Record<string, SimPlayer>;
  calendar: SeasonCalendar;
  competitions: Record<string, Competition>;
  fixtures: Fixture[];
};
