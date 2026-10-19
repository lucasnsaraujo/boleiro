import type { IsoDate } from "../gameState.js";

/**
 * One player's card record in one competition. `yellows` count toward the next three-card ban and
 * belong to `phase` (yellowPhase); `bans` are matches still to serve.
 */
export type PlayerDiscipline = { yellows: number; phase: number; bans: number };

/** Card records by competition id, then player id. A competition's records end with it. */
export type Discipline = Record<string, Record<string, PlayerDiscipline>>;

/** Yellows and reds one side got in a match. A second yellow counts as a red only. */
export type CardCount = { yellows: number; reds: number };

export type MatchCards = { home: CardCount; away: CardCount };

type CardEvent = { playerId: string; clubId: string; competitionId: string; fixtureId: string; date: IsoDate };

export type PlayerBooked = CardEvent & { type: "playerBooked"; minute: number };
export type PlayerSentOff = CardEvent & { type: "playerSentOff"; minute: number; secondYellow: boolean };
export type PlayerSuspended = CardEvent & { type: "playerSuspended"; matches: number };

export type DisciplineEvent = PlayerBooked | PlayerSentOff | PlayerSuspended;
