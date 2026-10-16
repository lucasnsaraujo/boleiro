import { randomStream } from "../../engine/random.js";
import { knockoutDates, REALISTA, spreadPick, type Formats } from "../formats.js";
import type { IsoDate, MatchResult } from "../gameState.js";
import { inSeason } from "../seasonCalendar.js";
import { shuffle } from "../shuffle.js";
import { standings } from "../standings.js";
import { EUROPE } from "../world/europe.js";
import { scoreDraw } from "../world/resultOnlyLeague.js";
import { UEFA_CUPS, type UefaCup } from "../world/uefaPlaces.js";
import type { World, WorldClub } from "../world/world.js";
import { unifiedUefaCalendar, type UefaCalendar } from "./continentalDays.js";
import { elevenAverage } from "./continentalField.js";
import { drawGroupMatches } from "./groupStageDraw.js";
import { drawLeaguePhase, LEAGUE_PHASE_CLUBS } from "./leaguePhaseDraw.js";

export const KNOCKOUT_ROUNDS = ["playoffs", "round-of-16", "quarter-finals", "semi-finals", "final"] as const;
export type KnockoutRoundName = (typeof KNOCKOUT_ROUNDS)[number];

/**
 * A knockout round as drawn: each tie's clubs, the better-placed one first, who hosts the second
 * leg (or the single match, when `dates` holds one). `results` holds each tie's legs in order, two characters a leg (goals from "0", home side
 * first), then its winner's side, "0" first club or "1" second; "-" for what is not played yet.
 */
export type KnockoutRound = { name: KnockoutRoundName; dates: IsoDate[]; ties: [string, string][]; results: string };

/**
 * A season of the Champions League or Europa League in its league-phase format, played result-only.
 * `clubIds` are the 36 clubs pot by pot, `matches` the league phase's matchdays one after the other,
 * 18 a day, home club first, and `results` their scores, two characters each ("--" unplayed). In a
 * game whose formats play groups, the matches are nine groups' round robins, ranked as one table.
 */
export type LeaguePhaseCup = {
  cup: UefaCup;
  season: number;
  clubIds: string[];
  countries: Record<string, string>;
  drawOrder: string[];
  dates: IsoDate[];
  matches: [string, string][];
  results: string;
  knockout: KnockoutRound[];
};

/** The UEFA Super Cup: the Champions League winner against the Europa League's, one match. */
export type SuperCup = { season: number; date: IsoDate; clubIds: [string, string]; result: string };

export type EuropeanWinners = { season: number; championsLeague: string; europaLeague: string; superCup: string | null };

/** UEFA's club competitions of the season, which runs from August to the next summer; and the champions of those already played. */
export type EuropeanCups = { season: number; cups: LeaguePhaseCup[]; superCup: SuperCup | null; winners: EuropeanWinners[]; rngState: number };

const FIRST_SEASON = 2026;
const ROLLOVER = "07-01";
// On the unified calendar UEFA's season is the calendar year, filed with everyone else's.
const UNIFIED_ROLLOVER = "01-01";
const MATCHDAY_SIZE = LEAGUE_PHASE_CLUBS / 2;
const UNPLAYED = "-";
const ZERO_GOALS = "0".charCodeAt(0);

// The 2026/27 calendars (Wikipedia, "2026–27 UEFA Champions League" and "... Europa League", read
// 2026-10-15), one day per matchday and leg where UEFA spreads one over two or three. guess: the
// Europa League's semi-final first leg on 29 April, a week before the listed second leg. Later
// seasons keep the weekdays.
const CALENDARS: Record<UefaCup, { leaguePhase: IsoDate[]; knockout: Record<KnockoutRoundName, IsoDate[]> }> = {
  "champions-league": {
    leaguePhase: ["2026-09-08", "2026-10-13", "2026-10-20", "2026-11-03", "2026-11-24", "2026-12-08", "2027-01-19", "2027-01-27"],
    knockout: {
      playoffs: ["2027-02-16", "2027-02-23"],
      "round-of-16": ["2027-03-09", "2027-03-16"],
      "quarter-finals": ["2027-04-06", "2027-04-13"],
      "semi-finals": ["2027-04-27", "2027-05-04"],
      final: ["2027-06-05"],
    },
  },
  "europa-league": {
    leaguePhase: ["2026-09-17", "2026-10-15", "2026-10-22", "2026-11-05", "2026-11-26", "2026-12-10", "2027-01-21", "2027-01-28"],
    knockout: {
      playoffs: ["2027-02-18", "2027-02-25"],
      "round-of-16": ["2027-03-11", "2027-03-18"],
      "quarter-finals": ["2027-04-08", "2027-04-15"],
      "semi-finals": ["2027-04-29", "2027-05-06"],
      final: ["2027-05-26"],
    },
  },
};

// The 2026 Super Cup: Paris Saint-Germain, 2025/26 Champions League winners, against Aston Villa, the
// Europa League's, in Salzburg on 12 August 2026 (Wikipedia, "2026 UEFA Super Cup").
const SUPER_CUP_DATE = "2026-08-12";
const FIRST_SUPER_CUP: [string, string] = ["tm-583", "tm-405"];

// The 2026/27 league phases as Transfermarkt's participant pages listed them on 2026-10-14
// (pipeline snapshot 3), Transfermarkt ids.
const FIRST_FIELD: Record<UefaCup, string[]> = {
  "champions-league": [
    "tm-413", "tm-63993", "tm-2282", "tm-62", "tm-16", "tm-23826", "tm-27", "tm-79", "tm-1050", "tm-13", "tm-131", "tm-150",
    "tm-418", "tm-1082", "tm-583", "tm-826", "tm-11", "tm-281", "tm-31", "tm-405", "tm-985", "tm-2441", "tm-1047", "tm-12",
    "tm-46", "tm-6195", "tm-234", "tm-383", "tm-239", "tm-501", "tm-336", "tm-720", "tm-540", "tm-141", "tm-36", "tm-660",
  ],
  "europa-league": [
    "tm-53453", "tm-122", "tm-409", "tm-3948", "tm-58", "tm-156", "tm-829", "tm-197", "tm-941", "tm-15", "tm-533", "tm-681",
    "tm-940", "tm-1041", "tm-244", "tm-273", "tm-289", "tm-873", "tm-989", "tm-371", "tm-653", "tm-683", "tm-419", "tm-279",
    "tm-2976", "tm-5", "tm-506", "tm-1090", "tm-467", "tm-353", "tm-2300", "tm-238", "tm-2432", "tm-294", "tm-710", "tm-114",
  ],
};

// guess: the knockout play-offs pair 9th with 24th, 10th with 23rd and so on, and the round of 16
// sets each of the top eight against the play-off its place leads to (1st meets 16th or 17th), in a
// fixed bracket on to the final; UEFA draws between neighbouring places.
const BRACKET = [1, 8, 4, 5, 2, 7, 3, 6];

/** A date of the 2026/27 calendar on the same weekday in `season`'s. */
const shifted = (date: IsoDate, season: number) => inSeason(date, Number(date.slice(0, 4)) + season - FIRST_SEASON);

const FULL_GROUP_DAYS = 6;

/** The cup's 2026 calendar under `formats`: the real one with the days and legs it plays, or the unified one. */
function calendarOf(cup: UefaCup, formats: Formats): UefaCalendar {
  if (formats.calendar === "unified") return unifiedUefaCalendar(cup, formats);
  const { leaguePhase, knockout } = CALENDARS[cup];
  const days = formats.continentalGroups === "league-phase" ? leaguePhase.length : formats.continentalGroups === "groups-3" ? FULL_GROUP_DAYS / 2 : FULL_GROUP_DAYS;
  return {
    leaguePhase: spreadPick(leaguePhase, days),
    knockout: Object.fromEntries(Object.entries(knockout).map(([name, dates]) => [name, knockoutDates(name, dates, formats)])),
    superCup: SUPER_CUP_DATE,
  };
}

function clubsOf(world: World): Map<string, { club: WorldClub; country: string }> {
  return new Map(Object.entries(world).flatMap(([country, { clubs }]) => Object.values(clubs).map((club) => [club.id, { club, country }] as const)));
}

const tieLength = (round: Pick<KnockoutRound, "dates">) => 2 * round.dates.length + 1;
const goalsAt = (code: string, at: number) => code.charCodeAt(at) - ZERO_GOALS;

/** The cup's league phase as the clubs' matches, with their dates and scores once played. */
export function leaguePhaseMatches(cup: LeaguePhaseCup): { homeId: string; awayId: string; date: IsoDate; result: MatchResult | null }[] {
  return cup.matches.map(([homeId, awayId], i) => {
    const isPlayed = cup.results[2 * i] !== UNPLAYED;
    const result = isPlayed ? { homeGoals: goalsAt(cup.results, 2 * i), awayGoals: goalsAt(cup.results, 2 * i + 1) } : null;
    return { homeId, awayId, date: cup.dates[Math.floor(i / MATCHDAY_SIZE)] ?? "", result };
  });
}

/** The league phase's clubs in table order. guess: by the Brasileirão's tie-breaks, UEFA's own coming after goals scored. */
export function leaguePhaseTable(cup: LeaguePhaseCup): string[] {
  return standings(cup.clubIds, leaguePhaseMatches(cup), cup.drawOrder).map((row) => row.clubId);
}

export type TieLeg = { date: IsoDate; homeId: string; awayId: string; result: MatchResult | null };

/** A knockout tie's legs, the second hosted by its first club, and its winner once decided. */
export function knockoutTie(round: KnockoutRound, index: number): { clubIds: [string, string]; legs: TieLeg[]; winnerId: string | null; onPenalties: boolean } {
  const clubIds = round.ties[index] ?? ["", ""];
  const length = tieLength(round);
  const code = round.results.slice(index * length, (index + 1) * length);
  const legCount = round.dates.length;
  const legs = round.dates.map((date, leg): TieLeg => {
    const [homeId, awayId] = legCount === 2 && leg === 0 ? [clubIds[1], clubIds[0]] : clubIds;
    const isPlayed = code[2 * leg] !== UNPLAYED;
    return { date, homeId, awayId, result: isPlayed ? { homeGoals: goalsAt(code, 2 * leg), awayGoals: goalsAt(code, 2 * leg + 1) } : null };
  });
  const decider = code[length - 1];
  const winnerId = decider === "0" ? clubIds[0] : decider === "1" ? clubIds[1] : null;
  const [first, second] = aggregateOf(clubIds, legs);
  return { clubIds, legs, winnerId, onPenalties: winnerId !== null && first === second };
}

/** Each club's goals over the tie's legs played so far, in the order of `clubIds`. */
export function aggregateOf(clubIds: readonly [string, string], legs: readonly TieLeg[]): [number, number] {
  const goalsOf = (id: string) => legs.reduce((sum, { homeId, result }) => sum + (result ? (homeId === id ? result.homeGoals : result.awayGoals) : 0), 0);
  return [goalsOf(clubIds[0]), goalsOf(clubIds[1])];
}

const winnersOf = (round: KnockoutRound) => round.ties.map((_, i) => knockoutTie(round, i).winnerId ?? "");
const isRoundDone = (round: KnockoutRound) => !round.results.includes(UNPLAYED);

/** The cup's winner once its final is played, else null. */
export function cupChampion(cup: LeaguePhaseCup): string | null {
  const final = cup.knockout.find((round) => round.name === "final");
  return final && isRoundDone(final) ? (winnersOf(final)[0] ?? null) : null;
}

// The real Champions League winners before the game's first season, newest last: 2021/22 to 2025/26,
// filed under the year a season starts.
export const CHAMPIONS_LEAGUE_BEFORE = ["tm-418", "tm-281", "tm-418", "tm-583", "tm-583"];

/** The latest Champions League winner: the season's once its final is played and before it is filed, else the last one filed, else the last real one. */
export function latestChampionsLeagueWinner(europe: EuropeanCups | undefined): string | null {
  const cup = europe?.cups.find((c) => c.cup === "champions-league");
  return (cup && cupChampion(cup)) ?? europe?.winners.at(-1)?.championsLeague ?? CHAMPIONS_LEAGUE_BEFORE.at(-1) ?? null;
}

/** The two clubs ordered by league-phase place, the better first. */
function byPlace(table: readonly string[], a: string, b: string): [string, string] {
  return table.indexOf(a) <= table.indexOf(b) ? [a, b] : [b, a];
}

/** The cup's next knockout round, drawn from the league phase's table and the round before. */
function nextRound(cup: LeaguePhaseCup, formats: Formats): KnockoutRound {
  const table = leaguePhaseTable(cup);
  const name = KNOCKOUT_ROUNDS[cup.knockout.length] ?? "final";
  const at = (place: number) => table[place - 1] ?? "";
  const previous = cup.knockout.at(-1);
  let ties: [string, string][];
  if (!previous) ties = Array.from({ length: 8 }, (_, i): [string, string] => [at(16 - i), at(17 + i)]);
  else if (previous.name === "playoffs") {
    const playoffWinners = winnersOf(previous);
    ties = BRACKET.map((place): [string, string] => [at(place), playoffWinners[place - 1] ?? ""]);
  } else {
    const winners = winnersOf(previous);
    ties = Array.from({ length: winners.length / 2 }, (_, i) => byPlace(table, winners[2 * i] ?? "", winners[2 * i + 1] ?? ""));
  }
  const dates = (calendarOf(cup.cup, formats).knockout[name] ?? []).map((date) => shifted(date, cup.season));
  return { name, dates, ties, results: UNPLAYED.repeat(ties.length * tieLength({ dates })) };
}

type ClubOf = (id: string) => WorldClub;

const score = (homeGoals: number, awayGoals: number) => String.fromCharCode(ZERO_GOALS + homeGoals, ZERO_GOALS + awayGoals);

/** Today's leg of each tie of the round, and the ties it decides; the same round on a day it doesn't play. */
function playRoundDay(round: KnockoutRound, date: IsoDate, clubOf: ClubOf, random: () => number): KnockoutRound {
  const leg = round.dates.indexOf(date);
  if (leg < 0) return round;
  const length = tieLength(round);
  let results = "";
  round.ties.forEach((_, index) => {
    const tie = knockoutTie(round, index);
    let code = round.results.slice(index * length, (index + 1) * length);
    const today = tie.legs[leg];
    if (today && !today.result) {
      const { homeGoals, awayGoals } = scoreDraw(clubOf(today.homeId), clubOf(today.awayId), random);
      code = code.slice(0, 2 * leg) + score(homeGoals, awayGoals) + code.slice(2 * leg + 2);
      if (leg === tie.legs.length - 1) {
        const legs = tie.legs.map((l, i) => (i === leg ? { ...l, result: { homeGoals, awayGoals } } : l));
        const [first, second] = aggregateOf(tie.clubIds, legs);
        // guess: a level tie goes straight to penalties, an even draw; extra time is not played.
        const isSecondThrough = second > first || (second === first && random() < 0.5);
        code = code.slice(0, length - 1) + (isSecondThrough ? "1" : "0");
      }
    }
    results += code;
  });
  return results === round.results ? round : { ...round, results };
}

function playCupDay(cup: LeaguePhaseCup, date: IsoDate, clubOf: ClubOf, random: () => number, formats: Formats): LeaguePhaseCup {
  let next = cup;
  const matchday = cup.dates.indexOf(date);
  const from = matchday * MATCHDAY_SIZE;
  if (matchday >= 0 && cup.results[2 * from] === UNPLAYED) {
    let played = "";
    for (const [homeId, awayId] of cup.matches.slice(from, from + MATCHDAY_SIZE)) {
      const { homeGoals, awayGoals } = scoreDraw(clubOf(homeId), clubOf(awayId), random);
      played += score(homeGoals, awayGoals);
    }
    next = { ...cup, results: cup.results.slice(0, 2 * from) + played + cup.results.slice(2 * (from + MATCHDAY_SIZE)) };
  }
  const last = next.knockout.at(-1);
  if (last) {
    const played = playRoundDay(last, date, clubOf, random);
    if (played !== last) next = { ...next, knockout: [...next.knockout.slice(0, -1), played] };
  }
  const isPhaseDone = !next.results.includes(UNPLAYED);
  const current = next.knockout.at(-1);
  const isDrawDue = isPhaseDone && (current ? isRoundDone(current) && current.name !== "final" : true);
  return isDrawDue && next !== cup ? { ...next, knockout: [...next.knockout, nextRound(next, formats)] } : next;
}

/**
 * The league phase of `cup` drawn among `field` (or its groups, as `formats` plays them): pots by the
 * clubs' best elevens, the strongest first. guess: UEFA seeds by club coefficients.
 */
function openCup(cup: UefaCup, season: number, field: readonly string[], clubs: ReturnType<typeof clubsOf>, random: () => number, formats: Formats): LeaguePhaseCup {
  const strength = (id: string) => elevenAverage(clubs.get(id)?.club);
  const seeded = [...field].sort((a, b) => strength(b) - strength(a) || a.localeCompare(b));
  const countryOf = (id: string) => clubs.get(id)?.country ?? id;
  const { leaguePhase } = calendarOf(cup, formats);
  const days = formats.continentalGroups === "league-phase" ? drawLeaguePhase(seeded, countryOf, random) : drawGroupMatches(seeded, countryOf, formats.continentalGroups === "groups-3" ? 1 : 2, random);
  const matches = days.flat();
  return {
    cup,
    season,
    clubIds: seeded,
    countries: Object.fromEntries(seeded.map((id) => [id, countryOf(id)])),
    drawOrder: shuffle(seeded, random),
    dates: leaguePhase.map((date) => shifted(date, season)),
    matches,
    results: UNPLAYED.repeat(2 * matches.length),
    knockout: [],
  };
}

function openSeason(season: number, field: Record<UefaCup, string[]>, superCup: [string, string] | null, world: World, random: () => number, formats: Formats): Omit<EuropeanCups, "winners" | "rngState"> {
  const clubs = clubsOf(world);
  const superCupDate = calendarOf("champions-league", formats).superCup;
  return {
    season,
    cups: UEFA_CUPS.map((cup) => openCup(cup, season, field[cup], clubs, random, formats)),
    superCup: superCup && { season, date: shifted(superCupDate, season), clubIds: superCup, result: UNPLAYED.repeat(3) },
  };
}

const isWholeField = (field: Record<UefaCup, string[]>, world: World) => {
  const clubs = clubsOf(world);
  return UEFA_CUPS.every((cup) => field[cup].length === LEAGUE_PHASE_CLUBS && field[cup].every((id) => clubs.has(id)));
};

// The draws come from a stream of their own, so opening the cups leaves the game's main stream as it was.
const UEFA_STREAM_SALT = 0x0efa;

/**
 * The 2026/27 season of UEFA's cups on its real field (on the unified calendar, the 2026 season);
 * null for a game starting another season, or unless every European country is in the world.
 */
export function openingEuropeanCups(world: World, seed: number, season: number, formats: Formats = REALISTA): EuropeanCups | null {
  if (season !== FIRST_SEASON || !EUROPE.every((structure) => world[structure.id])) return null;
  if (!isWholeField(FIRST_FIELD, world)) return null;
  const random = randomStream((seed ^ UEFA_STREAM_SALT) >>> 0);
  const opened = openSeason(FIRST_SEASON, FIRST_FIELD, FIRST_SUPER_CUP, world, random.next, formats);
  return { ...opened, winners: [], rngState: random.state() };
}

/** Next season's field: every European country's places from the season it filed last. */
function fieldFromTables(world: World, season: number): Record<UefaCup, string[]> {
  const placesIn = (cup: UefaCup) =>
    EUROPE.flatMap((structure) => {
      const record = world[structure.id]?.seasons.at(-1);
      return record?.season === season - 1 ? (record.continental[cup] ?? []) : [];
    });
  return { "champions-league": placesIn("champions-league"), "europa-league": placesIn("europa-league") };
}

function playSuperCup(superCup: SuperCup | null, date: IsoDate, clubOf: ClubOf, random: () => number): SuperCup | null {
  if (!superCup || superCup.date !== date || superCup.result[0] !== UNPLAYED) return superCup;
  const [homeId, awayId] = superCup.clubIds;
  const { homeGoals, awayGoals } = scoreDraw(clubOf(homeId), clubOf(awayId), random);
  // guess: a draw goes straight to penalties, an even draw.
  const isAwayWinner = awayGoals > homeGoals || (awayGoals === homeGoals && random() < 0.5);
  return { ...superCup, result: score(homeGoals, awayGoals) + (isAwayWinner ? "1" : "0") };
}

/** The Super Cup's score once it is played, else null. */
export function superCupScore(superCup: SuperCup): MatchResult | null {
  return superCup.result[0] === UNPLAYED ? null : { homeGoals: goalsAt(superCup.result, 0), awayGoals: goalsAt(superCup.result, 1) };
}

/** The Super Cup's winner once it is played, else null. */
export function superCupWinner(superCup: SuperCup | null): string | null {
  if (!superCup || superCup.result[2] === UNPLAYED) return null;
  return superCup.clubIds[superCup.result[2] === "1" ? 1 : 0];
}

/**
 * Today's matches of UEFA's cups, played by the score draw on the result-only clubs of `world`; on 1
 * July (1 January on the unified calendar) after both finals (or after a season it could not field),
 * the season's winners filed and the next season opened on the places the countries filed last. The
 * same object on a day with nothing to do.
 */
export function playEuropeDay(europe: EuropeanCups, world: World, date: IsoDate, formats: Formats = REALISTA): EuropeanCups {
  const rollover = formats.calendar === "unified" ? UNIFIED_ROLLOVER : ROLLOVER;
  const isRollover = date.slice(5) === rollover && Number(date.slice(0, 4)) > europe.season;
  const isMatchDay = europe.superCup?.date === date || europe.cups.some((cup) => cup.dates.includes(date) || cup.knockout.at(-1)?.dates.includes(date));
  if (!isRollover && !isMatchDay) return europe;
  const clubs = clubsOf(world);
  const clubOf: ClubOf = (id) => {
    const found = clubs.get(id);
    if (!found) throw new Error(`no European club ${id} in the world`);
    return found.club;
  };
  const random = randomStream(europe.rngState);
  const cups = europe.cups.map((cup) => playCupDay(cup, date, clubOf, random.next, formats));
  const superCup = playSuperCup(europe.superCup, date, clubOf, random.next);
  let next: EuropeanCups = { ...europe, cups, superCup, rngState: random.state() };
  const [championsLeague, europaLeague] = cups.map(cupChampion);
  const champions: [string, string] | null = championsLeague && europaLeague ? [championsLeague, europaLeague] : null;
  if (isRollover && (champions || cups.length === 0)) {
    const season = Number(date.slice(0, 4));
    const field = fieldFromTables(world, season);
    const winners = champions ? [...europe.winners, { season: europe.season, championsLeague: champions[0], europaLeague: champions[1], superCup: superCupWinner(superCup) }] : europe.winners;
    const opened = isWholeField(field, world) ? openSeason(season, field, champions, world, random.next, formats) : { season, cups: [], superCup: null };
    next = { ...opened, winners, rngState: random.state() };
  }
  const isChanged = next.superCup !== europe.superCup || next.cups.some((cup, i) => cup !== europe.cups[i]) || next.season !== europe.season || next.winners !== europe.winners;
  return isChanged ? next : europe;
}
