import type { PositionGroup, Role } from "@boleiro/data/players";
import type { Formation } from "../../engine/formations.js";
import type { Fixture, IsoDate, MatchResult } from "../gameState.js";
import type { MatchEvent } from "../live/matchTimeline.js";

/** A player's season for one club: his games and goals for it, and his main position when he last played. */
export type SquadMark = [apps: number, goals: number, role: Role];

/** Why a sticker shines, as bits of `AlbumSticker`'s last number: a club idol, a top scorer, an award winner. */
export const SHINE = { idol: 1, topScorer: 2, award: 4 } as const;

/** A player's sticker on a season's page: his games and goals for the club that season, and why it shines (SHINE bits, 0 when it doesn't). */
export type AlbumSticker = [playerId: string, name: string, role: Role, apps: number, goals: number, shine: number];

/**
 * A season of a human coach at one club as his album printed it at the season's close. `since` is the
 * day its count began, when that was after the season did: a save from before the album, loaded mid-season.
 */
export type AlbumPage = { season: number; clubId: string; stickers: AlbumSticker[]; since?: IsoDate };

/** A kept match's player as he played it: his name, position group, strength then and club. */
export type KeptPlayer = [id: string, name: string, group: PositionGroup, strength: number, clubId: string];

export type PlayedFixture = Fixture & { result: MatchResult };

/** A club of a kept match as it was then: a club from abroad may be gone from the game by the next season. */
export type KeptClub = { name: string; colours?: { primary: string; secondary: string } };

/**
 * A match a human coach's album keeps whole after its season's fixtures go: a final his club played
 * (`isWon` when it took the cup) or the match that won it a league. A two-legged final keeps its
 * deciding leg whole and the first by its score.
 */
export type KeptMatch = {
  kind: "final" | "league";
  season: number;
  clubId: string;
  isWon: boolean;
  fixture: PlayedFixture;
  firstLeg: PlayedFixture | null;
  sides: { home: KeptClub; away: KeptClub };
  formations: { home: Formation; away: Formation };
  /** Everyone who played: the starters first, as they lined up, then the substitutes. */
  players: KeptPlayer[];
  starters: string[];
  events: MatchEvent[];
  /** Each player's 0–10 mark. */
  ratings: Record<string, number>;
  stadium: string | null;
  crowd: number | null;
  referee: string | null;
};
