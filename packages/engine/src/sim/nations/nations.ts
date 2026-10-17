import type { Confederation } from "@boleiro/data/nationalFootball";
import type { IsoDate } from "../gameState.js";
import type { NationalCompetitionKind } from "./fifaRanking.js";

/** A national team: its FIFA points (the ranking orders them) and how it looks. */
export type NationalTeam = { id: string; name: string; confederation: Confederation; code: string; colours: { primary: string; secondary: string }; points: number };

/**
 * The players of a national team's pool the game keeps no squad place for (they play abroad, outside the full
 * tier), as columns: name, position letter (g goleiro, l lateral, z zagueiro, m meia, a atacante), strength from
 * their market value, birth year (0 unknown) and club.
 */
export type Outsiders = { names: string[]; roles: string; strengths: number[]; born: number[]; clubs: string[] };

export type NationalResult = { home: number; away: number; penaltyWinnerId?: string; isAfterExtraTime?: true };

/** `round` is "group" for a group or league match, "friendly", or a knockout round ("round-of-32" … "final"); `leg` 2 for a tie's second match. */
export type NationalMatch = {
  id: string;
  competitionId: string;
  round: string;
  group?: string;
  leg?: 2;
  date: IsoDate;
  homeId: string;
  awayId: string;
  isNeutral?: true;
  result: NationalResult | null;
};

/** A knockout round: its days (a match goes on its day by order), two legs or one, and whether it takes the winners or the losers of `from` (the previous round when left out). */
export type KnockoutRound = { name: string; dates: IsoDate[]; legs: 1 | 2; takes: "winners" | "losers"; from?: number };

/**
 * A national competition: its groups (or one league table per group) and its knockout rounds, opened one at a time
 * as the one before ends; `entrants` are a knockout's teams in seeding order once drawn. `host` for a final
 * tournament with one. `places` is how many teams of each group go through (the rest by `bestOf`: e.g. the 8 best
 * thirds).
 */
export type NationalCompetition = {
  id: string;
  name: string;
  kind: NationalCompetitionKind;
  confederation?: Confederation;
  groups: Record<string, string[]>;
  places: number;
  bestOf?: { position: number; count: number };
  knockout: KnockoutRound[];
  /** Rounds opened so far. */
  opened: number;
  host?: string;
  until: IsoDate;
  winnerId?: string;
};

/** A team's players away with it: the game's own (`playerIds`) and its pool's others (`outsiders`, rows of its Outsiders), from `from` to `until`. */
export type CallUp = { teamId: string; playerIds: string[]; outsiders: number[]; from: IsoDate; until: IsoDate };

/** A title won: the competition, its season and the champion. */
export type NationalTitle = { competitionId: string; name: string; season: number; winnerId: string; runnerUpId?: string };

/** The human coach's national team, since when, and a job a federation offers him. */
export type NationalJob = { teamId: string; since: IsoDate };
export type NationalOffer = { teamId: string; expiresOn: IsoDate };

/** National football: the teams, their competitions and matches, who is away with them, and the human's job. */
export type Nations = {
  teams: Record<string, NationalTeam>;
  outsiders: Record<string, Outsiders>;
  /** The ranking's teams without a squad in the game, who never play: their names and points, for the table. */
  ranked: { name: string; points: number }[];
  /** The day of the FIFA ranking the career opened with, and where it came from. */
  rankingSource: { date: IsoDate; source: string };
  competitions: Record<string, NationalCompetition>;
  matches: NationalMatch[];
  callUps: Record<string, CallUp>;
  /** The game's players away with a national team, and the last day they are. */
  duty: Record<string, { teamId: string; until: IsoDate }>;
  titles: NationalTitle[];
  rngState: number;
  job?: NationalJob;
  offer?: NationalOffer;
  /** The human coach's call-up for the next window, by team; left out, his assistant's. */
  picks?: string[];
};

export const ROLE_LETTERS = { goleiro: "g", lateral: "l", zagueiro: "z", meia: "m", atacante: "a" } as const;
