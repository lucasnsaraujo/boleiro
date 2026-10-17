import type { Division } from "@boleiro/data/players";
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

export type ClubRecords = {
  biggestWin: MatchMark | null;
  biggestLoss: MatchMark | null;
  biggestCrowd: CrowdMark | null;
  recordSale: TransferMark | null;
  recordSigning: TransferMark | null;
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
};

/** A player's strength as it stood through one season; it only changes at the yearly turnover. */
export type StrengthMark = { season: number; strength: number };

export type CoachStint = { clubId: string; from: IsoDate; until: IsoDate | null; left: "fired" | "contractEnded" | "moved" | "resigned" | null };

export type CoachRecord = {
  stints: CoachStint[];
  trophies: { season: number; competition: CompetitionKey; clubId: string }[];
  firings: { clubId: string; date: IsoDate; position: number; targetPosition: number }[];
  seasons: { season: number; clubId: string; position: number; targetPosition: number }[];
  /** The clubs he walked out on; a record from before resigning existed has none. */
  resignations?: { clubId: string; date: IsoDate }[];
};

/** Everything a save remembers about its past. Sizes grow per season and per player-club pair, never per match. */
export type History = {
  seasons: SeasonRecord[];
  /** The season being played: champions decided so far and goals per competition and player. */
  current: { season: number; champions: Record<CompetitionKey, string>; goals: Record<CompetitionKey, Record<string, number>> };
  clubs: Record<string, ClubRecords>;
  /** Per club, then per player. */
  players: Record<string, Record<string, PlayerAtClub>>;
  /** Per player, one mark per season since the save began or he arrived, oldest first. */
  strength: Record<string, StrengthMark[]>;
  coach: CoachRecord;
};

export const NO_RECORDS: ClubRecords = { biggestWin: null, biggestLoss: null, biggestCrowd: null, recordSale: null, recordSigning: null };

export const competitionKey = (competitionId: string): CompetitionKey => competitionId.replace(/-\d+$/, "");

export function newHistory(season: number, date: IsoDate, coachClubId: string | null): History {
  return {
    seasons: [],
    current: { season, champions: {}, goals: {} },
    clubs: {},
    players: {},
    strength: {},
    coach: { stints: coachClubId ? [{ clubId: coachClubId, from: date, until: null, left: null }] : [], trophies: [], firings: [], seasons: [] },
  };
}
