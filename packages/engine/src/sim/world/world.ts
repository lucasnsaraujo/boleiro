import type { CountryCoaching } from "../coach/aiCoaches.js";
import type { IsoDate, LeagueFormatId } from "../gameState.js";
import type { CupFinal, LeaguePlace } from "./continentalPlaces.js";
import type { ResultOnlyCup } from "./resultOnlyCup.js";
import type { UefaAllocation } from "./uefaPlaces.js";

/** A level of a result-only pyramid: a round-robin table. */
type TableLevel = {
  name: string;
  /** 2 for home and away. */
  legs: 1 | 2;
  /** Top clubs going up a level at the season's end; the top level's are ignored. */
  promoted: number;
  /** Bottom clubs going down a level; the level below promotes as many, and the bottom level relegates none. */
  relegated: number;
  /** The real format it plays once in the full tier; left out, the straight round robin it plays result-only. */
  format?: LeagueFormatId;
};

/** A country the result-only tier plays: its league pyramid and how it qualifies for the continent. */
export type CountryStructure = {
  id: string;
  /** Top level first. */
  levels: TableLevel[];
  /** First and last match day of the league season, as `MM-DD`; a last day before the first falls in the next year. */
  window: [string, string];
  /** CONMEBOL's places, which all come from the top league's table. */
  continental: LeaguePlace<string>[];
  /** For a season crossing the new year: the day, `MM-DD`, it is filed and the next opens, instead of 1 January. */
  rollover?: string;
  /** Its places in UEFA's league phases, from its top table and its cup. */
  uefa?: UefaAllocation;
  /** Whether it plays its national cup. */
  hasCup?: boolean;
};

/**
 * A result-only club: its name and its squad as columns, one position letter (G, D, M, A) and one
 * strength per player; its colours and the players' names when the club may meet the full tier (a continental cup);
 * each player's year of birth, null when Transfermarkt gives no birth date (a club saved before ages keeps none).
 */
export type WorldClub = { id: string; name: string; positions: string; strengths: number[]; names?: string[]; born?: (number | null)[]; colours?: { primary: string; secondary: string } };

/**
 * One season of a result-only league. Its matches are the round robin of `clubIds`, one round per
 * date; `results` holds each match's score in that order as two characters, the goals counted from
 * "0" (so "21" is 2–1), "--" before it is played.
 */
export type ResultOnlyLeague = {
  id: string;
  season: number;
  clubIds: string[];
  legs: 1 | 2;
  /** Standings' last tie-break. */
  drawOrder: string[];
  dates: IsoDate[];
  results: string;
};

/** What a finished season decided: per level, top first, its champion and who went up and down; then the continental places. */
type CountrySeason = {
  season: number;
  champions: string[];
  promoted: string[][];
  relegated: string[][];
  continental: Record<string, string[]>;
  /** Its cup's final, when it plays one. */
  cup?: CupFinal;
  /** The days its top league's last round and its cup's final were played; a season filed before they were kept has none. */
  finals?: { league: IsoDate; cup?: IsoDate };
};

/** A result-only country in the game: its own random stream, so it plays and saves apart from the rest. */
export type Country = {
  structure: CountryStructure;
  clubs: Record<string, WorldClub>;
  /** This season's leagues, one per level, top first. */
  leagues: ResultOnlyLeague[];
  /** This season's national cup, for a country that plays one. */
  cup?: ResultOnlyCup;
  seasons: CountrySeason[];
  rngState: number;
  /** True when a human coach took one of its clubs: its leagues play in the full tier, and only its cup here. */
  isFullTier?: true;
  /** Its clubs' AI coaches, its pool and its ranking points; a save from before AI coaches gets them when it loads (withCoachWorld). */
  coaching?: CountryCoaching;
};

/** The unified calendar's days a result-only country plays on: the leagues' grid, round k on its k-th day, and the cups' shared midweeks. */
export type UnifiedDates = { league: IsoDate[]; cup: IsoDate[] };

/** Every result-only country, by id. */
export type World = Record<string, Country>;
