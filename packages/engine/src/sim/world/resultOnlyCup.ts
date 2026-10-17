import { addDays, daysBetween } from "../dates.js";
import type { IsoDate, MatchResult } from "../gameState.js";
import { shuffle } from "../shuffle.js";
import type { CupFinal } from "./continentalPlaces.js";
import { hasNationalCupExtraTime } from "../tieBreaks.js";
import { scoreDraw, settleLevelTie, windowDates } from "./resultOnlyLeague.js";
import type { WorldClub } from "./world.js";

/**
 * One season of a result-only national cup: single matches, a club's draw settled on penalties.
 * `bracket` is the first round's draw in pairs, home club first, "" for a bye; each later match
 * brings the winners of two neighbouring ones together. `results` holds every match round after
 * round as its score in two characters (goals counted from "0", extra time's included) and the winning
 * side, "0" home or "1" away ("2" or "3" when won in extra time, "4" or "5" on penalties after it); a bye
 * as "xx" and its club's side; "---" before it is played. A level score went to penalties.
 */
export type ResultOnlyCup = { id: string; season: number; bracket: string[]; dates: IsoDate[]; results: string };

const BYE = "";
const UNPLAYED = "---";
const BYE_SCORE = "xx";
const ZERO_GOALS = "0".charCodeAt(0);
const WON_IN_EXTRA_TIME = 2;
const WON_ON_PENALTIES_AFTER_EXTRA_TIME = 4;
// The first round comes about five weeks into the league season and the final a week before its end.
const FIRST_ROUND_DELAY = 35;
const FINAL_BEFORE_END = 7;
// A cup round that falls on a league day moves to the midweek after it.
const MIDWEEK = 3;

const roundSizes = (bracket: readonly string[]): number[] => {
  const sizes: number[] = [];
  for (let matches = bracket.length / 2; matches >= 1; matches /= 2) sizes.push(matches);
  return sizes;
};

/** The cup's dates, one per round, spread over the league season and kept off its match days. */
function cupDates(season: number, window: [string, string], rounds: number, leagueDates: readonly IsoDate[]): IsoDate[] {
  const [start, end] = windowDates(season, window);
  const first = addDays(start, FIRST_ROUND_DELAY);
  const span = daysBetween(first, addDays(end, -FINAL_BEFORE_END));
  const taken = new Set(leagueDates);
  return Array.from({ length: rounds }, (_, i) => {
    const date = addDays(first, rounds > 1 ? Math.round((i * span) / (rounds - 1)) : 0);
    return taken.has(date) ? addDays(date, MIDWEEK) : date;
  });
}

/**
 * The season's cup with every club of `levels` (top level first) drawn in. guess: only the clubs of
 * the leagues the game plays enter, while the real cups take in amateur clubs too; the byes that fill
 * the bracket to a power of two go to the top level's clubs first. On the unified calendar its rounds
 * take the last of the shared `midweeks`, the final on the last.
 */
export function openCup(
  id: string,
  season: number,
  levels: readonly (readonly string[])[],
  window: [string, string],
  leagueDates: readonly IsoDate[],
  random: () => number,
  midweeks?: readonly IsoDate[],
): ResultOnlyCup {
  const entrants = levels.flat();
  if (entrants.length < 2) throw new Error(`${id}: a cup needs two clubs`);
  let size = 2;
  while (size < entrants.length) size *= 2;
  const byes = size - entrants.length;
  const seeded = levels.flatMap((level) => shuffle(level, random)).slice(0, byes);
  const rest = shuffle(entrants.filter((club) => !seeded.includes(club)), random);
  const bracket = shuffle([...seeded.map((club) => [club, BYE]), ...Array.from({ length: rest.length / 2 }, (_, i) => [rest[2 * i] ?? BYE, rest[2 * i + 1] ?? BYE])], random).flat();
  const rounds = roundSizes(bracket).length;
  if (midweeks && midweeks.length < rounds) throw new Error(`${id}: ${rounds} rounds do not fit ${midweeks.length} midweeks`);
  const dates = midweeks ? midweeks.slice(midweeks.length - rounds) : cupDates(season, window, rounds, leagueDates);
  return { id, season, bracket, dates, results: UNPLAYED.repeat(size - 1) };
}

type CupMatch = { round: number; homeId: string; awayId: string; result: MatchResult | null; winnerId: string | null };

/** Every match of the cup, round after round, with its clubs once the round before is played, and its score and winner once played. */
export function cupMatches(cup: ResultOnlyCup): CupMatch[] {
  const matches: CupMatch[] = [];
  let entrants = cup.bracket;
  let offset = 0;
  const sizes = roundSizes(cup.bracket);
  sizes.forEach((size, round) => {
    const winners: string[] = [];
    for (let i = 0; i < size; i++) {
      const homeId = entrants[2 * i] ?? BYE;
      const awayId = entrants[2 * i + 1] ?? BYE;
      const code = cup.results.slice(3 * (offset + i), 3 * (offset + i) + 3);
      const isPlayed = code !== UNPLAYED;
      const side = Number(code[2]);
      const winnerId = isPlayed ? (side % 2 ? awayId : homeId) : null;
      const isBye = code.startsWith(BYE_SCORE);
      const score = { homeGoals: code.charCodeAt(0) - ZERO_GOALS, awayGoals: code.charCodeAt(1) - ZERO_GOALS };
      const isAfterExtraTime = side >= WON_IN_EXTRA_TIME;
      const result = isPlayed && !isBye ? { ...score, ...(isAfterExtraTime ? { isAfterExtraTime: true as const } : {}) } : null;
      matches.push({ round, homeId, awayId, result, winnerId });
      winners.push(winnerId ?? BYE);
    }
    entrants = winners;
    offset += size;
  });
  return matches;
}

/** The country of a cup, from its id ("de-cup-2026"). */
const countryOf = (cup: ResultOnlyCup) => cup.id.replace(/-cup-\d+$/, "");

/** The cup with today's round played, or the same cup when today has none or its clubs are not known yet. */
export function playCupDay(cup: ResultOnlyCup, date: IsoDate, clubOf: (id: string) => WorldClub, random: () => number): ResultOnlyCup {
  const round = cup.dates.indexOf(date);
  if (round < 0) return cup;
  const matches = cupMatches(cup);
  const from = matches.findIndex((m) => m.round === round);
  const today = matches.filter((m) => m.round === round);
  if (today.some((m) => m.winnerId !== null) || today.some((m) => m.homeId === BYE && m.awayId === BYE)) return cup;
  let played = "";
  const hasExtraTime = hasNationalCupExtraTime(countryOf(cup), round, cup.dates.length);
  for (const { homeId, awayId } of today) {
    if (awayId === BYE || homeId === BYE) {
      played += `${BYE_SCORE}${awayId === BYE ? "0" : "1"}`;
      continue;
    }
    let { homeGoals, awayGoals } = scoreDraw(clubOf(homeId), clubOf(awayId), random);
    let side = awayGoals > homeGoals ? 1 : 0;
    if (homeGoals === awayGoals) {
      const { extraTime, isAwayShootoutWinner } = settleLevelTie(clubOf(homeId), clubOf(awayId), hasExtraTime, random);
      homeGoals += extraTime?.homeGoals ?? 0;
      awayGoals += extraTime?.awayGoals ?? 0;
      const settledBy = homeGoals !== awayGoals ? WON_IN_EXTRA_TIME : extraTime ? WON_ON_PENALTIES_AFTER_EXTRA_TIME : 0;
      side = settledBy + Number(homeGoals === awayGoals ? isAwayShootoutWinner : awayGoals > homeGoals);
    }
    played += String.fromCharCode(ZERO_GOALS + homeGoals, ZERO_GOALS + awayGoals) + String(side);
  }
  return { ...cup, results: cup.results.slice(0, 3 * from) + played + cup.results.slice(3 * (from + today.length)) };
}

/** The final's winner and loser once it is played, else null. */
export function cupFinal(cup: ResultOnlyCup): CupFinal | null {
  const final = cupMatches(cup).at(-1);
  if (!final?.winnerId) return null;
  return { championId: final.winnerId, runnerUpId: final.winnerId === final.homeId ? final.awayId : final.homeId };
}
