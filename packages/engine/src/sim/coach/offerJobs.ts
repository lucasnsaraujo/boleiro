import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { clubStatures } from "./clubStatures.js";
import { isCoolingDown, OFFER_REACH, type JobOffer } from "./coach.js";
import { coachSalary } from "./coachSalary.js";
import { isHumanClub } from "./humanCoaches.js";
import { rivalBlockOf } from "../rivalries/idols.js";
import { keyedSeed, randomStream } from "../../engine/random.js";
import { proxyClubOf } from "../world/joinFullTier.js";
import { squadLevel, staturesByStrength } from "./aiCoaches.js";

export type JobOffered = { type: "jobOffered"; offer: JobOffer };

// guess: a club waits two weeks for an answer before it hires someone else.
export const OFFER_DAYS = 14;
// guess: an employed coach only hears from clubs clearly bigger than his own.
const STEP_UP = 10;
// guess: an unemployed coach with no offer on the table hears from some club about once a month.
const IDLE_OFFER_CHANCE_PER_DAY = 1 / 30;
// guess: contracts signed in the second half of the year run to the end of the next season.
const SECOND_HALF_FROM_MONTH = 7;

// Few clubs abroad hire Brazilian coaches: Reuters counted two at Europe's top clubs in a decade,
// Luxemburgo at Real Madrid in 2005 and Scolari at Chelsea in 2008, and blamed language, badges and
// pay (Ahram Online, 2014, https://english.ahram.org.eg/News/95021.aspx); none has led a big-five club
// since Sylvinho's Lyon in 2019 (Flashscore, 2025, https://www.flashscore.com/news/soccer-fifa-club-world-cup-flamengo-boss-filipe-luis-garners-attention-from-european-clubs-despite-club-world-cup-loss/hbsFUrw8).
// guess: a club abroad only calls a coach with two seasons in the game behind him and a name of at
// least 75 (the upper half of Série A's), 100 for the biggest club of the strongest league, and one
// open job in two hundred calls him: a top name hears from three or four a year, mostly smaller leagues.
const ABROAD_REPUTATION = { least: 75, most: 100 };
const ABROAD_SEASONS = 2;
const ABROAD_INTEREST = 0.005;

/**
 * How hard a result-only club is to reach from Brazil, 0 to 1: its squad's percentile in its country
 * times its country's, the strength of its top league between the weakest and the strongest in the world.
 */
function abroadPrestige(state: Pick<GameState, "world">): Map<string, number> {
  const countries = Object.values(state.world ?? {}).filter((country) => !country.isFullTier);
  const topLevel = (country: (typeof countries)[number]) => {
    const top = country.leagues[0]?.clubIds ?? [];
    return top.reduce((sum, id) => sum + squadLevel(country.clubs[id]?.strengths ?? []), 0) / Math.max(1, top.length);
  };
  const levels = countries.map(topLevel);
  const [weakest, strongest] = [Math.min(...levels), Math.max(...levels)];
  const prestige = new Map<string, number>();
  countries.forEach((country, i) => {
    const weight = strongest > weakest ? ((levels[i] ?? weakest) - weakest) / (strongest - weakest) : 1;
    for (const [id, stature] of staturesByStrength(Object.values(country.clubs))) prestige.set(id, (weight * stature) / 100);
  });
  return prestige;
}

/**
 * The result-only clubs abroad whose job opened on the day before yesterday's play (the world's coaches
 * move after the career's part of a day) and that call the coach: his name reaches theirs and their own
 * stream of interest, keyed by the club and the day, says yes.
 */
function abroadCallers(state: GameState): string[] {
  const { coach } = state;
  if (coach.reputation < ABROAD_REPUTATION.least || state.history.coach.seasons.length < ABROAD_SEASONS) return [];
  const opened = addDays(state.date, -2);
  const jobs = Object.values(state.world ?? {}).flatMap((country) => (country.isFullTier ? [] : Object.entries(country.coaching?.openJobs ?? {}).filter(([, date]) => date === opened).map(([clubId]) => clubId)));
  if (!jobs.length) return [];
  const prestige = abroadPrestige(state);
  return jobs.sort().filter((clubId) => {
    const bar = ABROAD_REPUTATION.least + (ABROAD_REPUTATION.most - ABROAD_REPUTATION.least) * (prestige.get(clubId) ?? 1);
    return coach.reputation >= bar && randomStream(keyedSeed(state.seed, `abroad-${clubId}-${opened}`)).next() < ABROAD_INTEREST;
  });
}

/** The offer a club makes the coach today: its salary, a contract to the season's end (the next one's from July) and two weeks to answer. */
export function jobOffer(state: GameState, clubId: string): JobOffer {
  const month = Number(state.date.slice(5, 7));
  const proxy = clubId in state.clubs ? null : proxyClubOf(state, clubId);
  return {
    clubId,
    salary: coachSalary(state, proxy ?? clubId),
    untilSeason: month >= SECOND_HALF_FROM_MONTH ? state.season + 1 : state.season,
    expiresOn: addDays(state.date, OFFER_DAYS),
  };
}

/**
 * Drops expired offers, then offers the player's coach the clubs' open jobs that his reputation
 * reaches, but for the big derby rivals of a club he is an idol of. Clubs with an open job go to `vacancies`; an unemployed coach also hears from a club now and then,
 * and a coach with a big name now and then from a club abroad (abroadCallers).
 * A retired coach hears from nobody.
 */
export function offerJobs(state: GameState, vacancies: readonly string[], random: () => number): { state: GameState; events: JobOffered[] } {
  const { coach, coachClubId } = state;
  if (coach.retiredOn) return { state, events: [] };
  // A club another hot-seat coach has taken is no longer hiring.
  let offers = coach.offers.filter((offer) => offer.expiresOn >= state.date && (offer.clubId === coachClubId || !isHumanClub(state, offer.clubId)));
  // Ranked only when a job is open or an idle coach hears from a club: most days need neither.
  let ranked: { statures: Map<string, number>; floor: number } | null = null;
  const rank = () => {
    if (ranked) return ranked;
    const statures = clubStatures(state);
    ranked = { statures, floor: coachClubId ? (statures.get(coachClubId) ?? 0) + STEP_UP : -Infinity };
    return ranked;
  };
  const isWithinReach = (clubId: string) => {
    const { statures, floor } = rank();
    const stature = statures.get(clubId);
    return stature !== undefined && clubId in state.boards && stature <= coach.reputation + OFFER_REACH && stature >= floor;
  };
  const isNew = (clubId: string) =>
    !isHumanClub(state, clubId) && !offers.some((offer) => offer.clubId === clubId) && !isCoolingDown(coach, clubId, state.season) && rivalBlockOf(state, clubId) === null;
  const offering = [...vacancies.filter((id) => isWithinReach(id) && isNew(id)), ...abroadCallers(state).filter(isNew)];
  // A come-back offer comes from the career moments, on their own stream: it leaves the idle coach's draw where it was.
  if (!coachClubId && !offers.some((offer) => !offer.isComeBack) && !offering.length && random() < IDLE_OFFER_CHANCE_PER_DAY) {
    const reachable = [...rank().statures.keys()].filter((id) => isWithinReach(id) && isNew(id)).sort();
    const pick = reachable[Math.floor(random() * reachable.length)];
    if (pick) offering.push(pick);
  }
  const made = offering.map((clubId) => jobOffer(state, clubId));
  offers = [...offers, ...made];
  if (offers.length === coach.offers.length && !made.length) return { state, events: [] };
  return { state: { ...state, coach: { ...coach, offers } }, events: made.map((offer) => ({ type: "jobOffered", offer })) };
}
