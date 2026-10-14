import type { IsoDate } from "../gameState.js";
import type { LeaguePlace } from "./continentalPlaces.js";

/** A level of a result-only pyramid: a round-robin table. */
type TableLevel = {
  name: string;
  /** 2 for home and away. */
  legs: 1 | 2;
  /** Top clubs going up a level at the season's end; the top level's are ignored. */
  promoted: number;
  /** Bottom clubs going down a level; the level below promotes as many, and the bottom level relegates none. */
  relegated: number;
};

/** A country the result-only tier plays: its league pyramid and how it qualifies for the continent. */
export type CountryStructure = {
  id: string;
  /** Top level first. */
  levels: TableLevel[];
  /** First and last match day of the league season in the calendar year, as `MM-DD`. */
  window: [string, string];
  /** No cup is played result-only, so every place comes from the top league's table. */
  continental: LeaguePlace<string>[];
};

/** A result-only club: its name and its squad as columns, one position letter (G, D, M, A) and one strength per player. */
export type WorldClub = { id: string; name: string; positions: string; strengths: number[] };

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
};

/** A result-only country in the game: its own random stream, so it plays and saves apart from the rest. */
export type Country = {
  structure: CountryStructure;
  clubs: Record<string, WorldClub>;
  /** This season's leagues, one per level, top first. */
  leagues: ResultOnlyLeague[];
  seasons: CountrySeason[];
  rngState: number;
};

/** Every result-only country, by id. */
export type World = Record<string, Country>;
