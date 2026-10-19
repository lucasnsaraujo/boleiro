import type { Division, Role } from "@boleiro/data/players";
import type { AlbumPage, KeptMatch, SquadMark } from "../album/album.js";
import type { CareerMoments } from "../moments/careerMoments.js";
import type { IsoDate } from "../gameState.js";

/** Competition ids without the season, so titles line up across years: `serie-a`, `copa-do-brasil`, `state-sp`. */
export type CompetitionKey = string;

export type MatchMark = {
  season: number;
  date: IsoDate;
  competition: CompetitionKey;
  opponentId: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
};

export type CrowdMark = { season: number; date: IsoDate; competition: CompetitionKey; opponentId: string; crowd: number };

/** `otherClubId` is the buyer of a sale or the seller of a signing; null means abroad. */
export type TransferMark = { season: number; date: IsoDate; playerId: string; name: string; otherClubId: string | null; fee: number };

/** A player's goals for one club, or in one league, over a season. */
export type GoalsMark = { season: number; playerId: string; name: string; clubId: string; goals: number };

/** A goal by a player of `age`, the youngest so far. */
export type ScorerMark = { season: number; date: IsoDate; competition: CompetitionKey; playerId: string; name: string; clubId: string; opponentId: string; age: number };

/** Games in a row without defeat, in every competition, from the first game's date to the last's. */
export type RunMark = { games: number; from: IsoDate; until: IsoDate };

/**
 * The league records a club's history keeps; saves from before them lack `mostSeasonGoals`,
 * `longestUnbeaten`, `youngestScorer` and the run under way (`unbeaten`), which start empty.
 */
export type ClubRecords = {
  biggestWin: MatchMark | null;
  biggestLoss: MatchMark | null;
  biggestCrowd: CrowdMark | null;
  recordSale: TransferMark | null;
  recordSigning: TransferMark | null;
  mostSeasonGoals?: GoalsMark | null;
  longestUnbeaten?: RunMark | null;
  youngestScorer?: ScorerMark | null;
  unbeaten?: RunMark | null;
};

/** A league's biggest win, from the home side's view. */
export type LeagueWin = { season: number; date: IsoDate; homeId: string; awayId: string; homeGoals: number; awayGoals: number };

/** A league's records across seasons. */
export type LeagueRecords = { biggestWin: LeagueWin | null; mostSeasonGoals: GoalsMark | null; youngestScorer: ScorerMark | null };

/** A player's season in one competition: games rated, the sum of his ratings in tenths, and his assists. */
export type SeasonMark = [apps: number, ratingTenths: number, assists: number];

/** A player picked for an award, with his season in the league that awards it. */
export type AwardedPlayer = { playerId: string; name: string; clubId: string; role: Role; age: number; apps: number; goals: number; assists: number; average: number };

/**
 * One of the Ballon d'Or's top three: a player of the full tier with his season in every competition,
 * or one of a club played result-only, known only by his strength and his club's titles.
 */
export type BallonDorVote = { playerId: string; name: string; clubId: string; clubName: string; score: number; titles: CompetitionKey[]; apps: number | null; goals: number | null; average: number | null };

/**
 * The season's awards: the Brasileirão's Bola de Ouro (with the next two), its Bola de Prata team (the
 * season's team, goalkeeper first and attack last), top scorer and best young player, and the world's
 * Ballon d'Or top three. Each is null, or empty, when nobody played enough to win it. The top scorer
 * stays named after he leaves the game, as the history's top scorers do.
 */
export type SeasonAwards = {
  competition: CompetitionKey;
  bolaDeOuro: AwardedPlayer | null;
  runnersUp: AwardedPlayer[];
  bolaDePrata: AwardedPlayer[];
  topScorer: TopScorer | null;
  bestYoung: AwardedPlayer | null;
  ballonDor: BallonDorVote[];
};

/** A player's running totals for one club, in every competition. */
export type PlayerAtClub = { name: string; apps: number; goals: number };

export type TopScorer = { playerId: string; name: string; clubId: string; goals: number };

export type SeasonRecord = {
  season: number;
  champions: Record<CompetitionKey, string>;
  topScorers: Record<CompetitionKey, TopScorer>;
  promoted: Record<Division, string[]>;
  relegated: Record<Division, string[]>;
  /** Each division's final order, champion first. */
  tables: Record<Division, string[]>;
  /** A season filed before awards has none. */
  awards?: SeasonAwards;
};

/** A player's strength as it stood through one season; it only changes at the yearly turnover. */
export type StrengthMark = { season: number; strength: number };

export type CoachStint = { clubId: string; from: IsoDate; until: IsoDate | null; left: "fired" | "contractEnded" | "moved" | "resigned" | "retired" | null };

export type CoachRecord = {
  stints: CoachStint[];
  trophies: { season: number; competition: CompetitionKey; clubId: string }[];
  firings: { clubId: string; date: IsoDate; position: number; targetPosition: number }[];
  seasons: { season: number; clubId: string; position: number; targetPosition: number }[];
  /** The clubs he walked out on; a record from before resigning existed has none. */
  resignations?: { clubId: string; date: IsoDate }[];
  /** His album: one page per season and club he ran, printed at the season's close; a record from before the album has none. */
  album?: AlbumPage[];
  /** The finals his clubs played and the matches that won them a league, kept whole; a record from before the album has none. */
  keptMatches?: KeptMatch[];
  /** His career's big moments, waiting and shown, and what the moments engine keeps to find them; a record from before moments has none. */
  moments?: CareerMoments;
};

/** Everything a save remembers about its past. Sizes grow per season and per player-club pair, never per match. */
export type History = {
  seasons: SeasonRecord[];
  /** The season being played: champions decided so far and goals per competition and player. */
  current: {
    season: number;
    champions: Record<CompetitionKey, string>;
    goals: Record<CompetitionKey, Record<string, number>>;
    /** Per competition, then per player; a save from before ratings starts the season's with none. */
    ratings?: Record<CompetitionKey, Record<string, SeasonMark>>;
    /** Per human coach's club, then per player: his games and goals for it this season while a human coach ran it. */
    squads?: Record<string, Record<string, SquadMark>>;
    /** The day the squads' count began, when it began after the season did: a save from before the album, loaded mid-season. */
    squadsSince?: IsoDate;
  };
  clubs: Record<string, ClubRecords>;
  /** Per club, then per player. */
  players: Record<string, Record<string, PlayerAtClub>>;
  /** Per player, one mark per season since the save began or he arrived, oldest first; a save writes each player's as one line (saveGame). */
  strength: Record<string, StrengthMark[]>;
  coach: CoachRecord;
  /** Each full-tier league's records, by competition; a save from before them has none. */
  leagues?: Record<CompetitionKey, LeagueRecords>;
};

export const NO_RECORDS: ClubRecords = { biggestWin: null, biggestLoss: null, biggestCrowd: null, recordSale: null, recordSigning: null };

export const competitionKey = (competitionId: string): CompetitionKey => competitionId.replace(/-\d+$/, "");

export function newHistory(season: number, date: IsoDate, coachClubId: string | null): History {
  return {
    seasons: [],
    current: { season, champions: {}, goals: {}, squads: {} },
    clubs: {},
    players: {},
    strength: {},
    coach: { stints: coachClubId ? [{ clubId: coachClubId, from: date, until: null, left: null }] : [], trophies: [], firings: [], seasons: [] },
  };
}
