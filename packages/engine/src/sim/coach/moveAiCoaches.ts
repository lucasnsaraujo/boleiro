import { randomStream } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";
import { leagueTable } from "../world/resultOnlyLeague.js";
import type { Country, ResultOnlyLeague, World } from "../world/world.js";
import { coachesByClub, fullTierClubs, fullTierStatures, inventCoach, squadLevel, staturesByStrength, type AiCoach, type Coaching } from "./aiCoaches.js";
import { humanClubIds, waitingCoachesOf } from "./humanCoaches.js";
import { OFFER_DAYS } from "./offerJobs.js";

/** An AI club named its new head coach. */
export type CoachAppointed = { type: "coachAppointed"; clubId: string; coachId: string; name: string };

// guess: a fired coach's name is worth a little less on the market.
const FIRED_REPUTATION_COST = 3;
// guess: a club looks for a coach whose reputation is close to its stature, at home first.
const SAME_COUNTRY_PREFERENCE = 12;
const PICK_NOISE = 6;
// guess: no one in the pool within this many points of the club's stature, and the club promotes someone new.
const FIT_RANGE = 20;
/**
 * The result-only world's sackings, judged on the first of each month from the league table against
 * the order of the clubs' squad strength. Calibrated so about 57% of its clubs change coach in a season:
 * CIES counted 484 of 850 teams in 2022/23 (56.9%) across its leagues
 * (https://football-observatory.com/Less-than-one-in-two-coaches-finished-the-season).
 */
const MONTHLY_SACKING = 0.115;
const UNDERPERFORMANCE_WEIGHT = 2.5;
// guess: no club abroad judges its coach before four rounds.
const GRACE_ROUNDS = 4;

const close = (coach: AiCoach, date: IsoDate, left: "fired" | "replaced"): AiCoach => ({
  ...coach,
  clubId: null,
  reputation: left === "fired" ? Math.max(0, coach.reputation - FIRED_REPUTATION_COST) : coach.reputation,
  stints: coach.stints.map((stint) => (stint.until === null ? { ...stint, until: date, left } : stint)),
});

/** The coaching with the coach of each of `clubIds` gone (`left` says how) and their jobs open since `date`, or closed when `opens` is false. */
function letGo(coaching: Coaching, clubIds: readonly string[], date: IsoDate, left: "fired" | "replaced", opens: boolean): Coaching {
  if (!clubIds.length) return coaching;
  const byClub = coachesByClub(coaching);
  const coaches = { ...coaching.coaches };
  const openJobs = { ...coaching.openJobs };
  for (const clubId of clubIds) {
    const coach = byClub.get(clubId);
    if (coach) coaches[coach.id] = close(coach, date, left);
    if (opens) openJobs[clubId] = date;
    else Reflect.deleteProperty(openJobs, clubId);
  }
  return { ...coaching, coaches, openJobs };
}

type Vacancy = { clubId: string; country: string; stature: number; prefix: string; season: number; date: IsoDate };

/** The pool coach the club hires: the closest reputation to its stature, at home first; or a new local coach when nobody fits. */
function hire(coaching: Coaching, { clubId, country, stature, prefix, season, date }: Vacancy, countryOf: (clubId: string) => string | undefined, random: () => number): Coaching {
  let best: AiCoach | null = null;
  let bestScore = -Infinity;
  for (const coach of Object.values(coaching.coaches)) {
    if (coach.clubId !== null || coach.retiredIn !== undefined) continue;
    const lastClub = coach.stints.at(-1)?.clubId;
    // A coach doesn't go straight back to the club that just let him go.
    if (lastClub === clubId) continue;
    const distance = Math.abs(coach.reputation - stature);
    if (distance > FIT_RANGE) continue;
    const home = (lastClub ? countryOf(lastClub) : undefined) === country;
    const score = -distance + (home ? SAME_COUNTRY_PREFERENCE : 0) + random() * PICK_NOISE;
    if (score > bestScore) {
      best = coach;
      bestScore = score;
    }
  }
  const coach = best ?? inventCoach(coaching, prefix, country, stature, season, null, null, random);
  const hired = { ...coach, clubId, stints: [...coach.stints, { clubId, from: date, until: null, left: null }] };
  const openJobs = { ...coaching.openJobs };
  Reflect.deleteProperty(openJobs, clubId);
  return { ...coaching, nextId: coaching.nextId + (best ? 0 : 1), coaches: { ...coaching.coaches, [hired.id]: hired }, openJobs };
}

/** Whether a human coach holds an open offer from the club: it waits for his answer before it hires someone else. */
function isWaitingForHuman(state: GameState, clubId: string): boolean {
  const offers = [state.coach, ...waitingCoachesOf(state).map((waiting) => waiting.coach)].flatMap((coach) => coach.offers);
  return offers.some((offer) => offer.clubId === clubId && offer.expiresOn >= state.date);
}

const dueJobs = (coaching: Coaching, date: IsoDate, isHeld: (clubId: string) => boolean): string[] =>
  Object.entries(coaching.openJobs)
    .filter(([clubId, opened]) => addDays(opened, OFFER_DAYS) <= date && !isHeld(clubId))
    .map(([clubId]) => clubId)
    .sort();

/**
 * The full tier's AI coaches' part of a day (`date`, the day played): the coaches the boards fired today
 * (`fired`) go to the free pool and their jobs open; a club a human coach left opens its job, a club one
 * took lets its AI coach go; and every job open for two weeks, with no human weighing its offer, goes
 * to the pool's best fit. Runs on the coaches' own stream.
 */
export function moveAiCoaches(state: GameState, before: GameState, fired: readonly string[], date: IsoDate): { state: GameState; events: CoachAppointed[] } {
  const world = state.coaches;
  if (!world) return { state, events: [] };
  const humans = new Set(humanClubIds(state));
  const humansBefore = new Set(humanClubIds(before));
  const newHumans = [...humans].filter((id) => !humansBefore.has(id));
  const formerHumans = [...humansBefore].filter((id) => !humans.has(id) && !(id in world.openJobs));
  const due = dueJobs(world, date, (clubId) => humans.has(clubId) || isWaitingForHuman(state, clubId));
  if (!fired.length && !newHumans.length && !formerHumans.length && !due.length) return { state, events: [] };

  let coaching: Coaching = letGo(world, fired.filter((id) => !humans.has(id)), date, "fired", true);
  coaching = letGo(coaching, newHumans, date, "replaced", false);
  coaching = { ...coaching, openJobs: { ...coaching.openJobs, ...Object.fromEntries(formerHumans.map((id) => [id, date])) } };
  const events: CoachAppointed[] = [];
  if (due.length) {
    const stream = randomStream(coaching.rngState);
    const countries = fullTierClubs(state);
    const statures = fullTierStatures(state);
    for (const clubId of due) {
      const vacancy = { clubId, country: countries.get(clubId) ?? "br", stature: statures.get(clubId) ?? 0, prefix: "", season: state.season, date };
      coaching = hire(coaching, vacancy, (id) => countries.get(id), stream.next);
      const hired = coachesByClub(coaching).get(clubId);
      if (hired) events.push({ type: "coachAppointed", clubId, coachId: hired.id, name: hired.name });
    }
    coaching = { ...coaching, rngState: stream.state() };
  }
  return { state: { ...state, coaches: { ...world, ...coaching } }, events };
}

/** How many rounds of the league are played. */
function roundsPlayed(league: ResultOnlyLeague): number {
  let played = 0;
  for (let i = 0; i < league.results.length; i += 2) if (league.results[i] !== "-") played++;
  return played / Math.max(1, Math.floor(league.clubIds.length / 2));
}

/** The country's clubs whose boards sack their coach on the first of a month. */
function sackings(country: Country, random: () => number): string[] {
  const sacked: string[] = [];
  for (const league of country.leagues) {
    const rounds = roundsPlayed(league);
    if (rounds < GRACE_ROUNDS || rounds >= league.dates.length) continue;
    const table = leagueTable(league);
    const level = (id: string) => squadLevel(country.clubs[id]?.strengths ?? []);
    const expected = [...league.clubIds].sort((a, b) => level(b) - level(a) || a.localeCompare(b));
    for (const clubId of [...league.clubIds].sort()) {
      const gap = (table.indexOf(clubId) - expected.indexOf(clubId)) / league.clubIds.length;
      if (random() < MONTHLY_SACKING * Math.max(0, 1 + UNDERPERFORMANCE_WEIGHT * gap)) sacked.push(clubId);
    }
  }
  return sacked;
}

/** A result-only country's coaches after the day played (`date`): its boards judge theirs on the first of the month, and its jobs open two weeks fill from its own pool. */
function moveCountryCoaches(id: string, country: Country, date: IsoDate): Country {
  const { coaching } = country;
  if (!coaching || country.isFullTier) return country;
  const isJudgingDay = date.endsWith("-01");
  const due = dueJobs(coaching, date, () => false);
  if (!isJudgingDay && !due.length) return country;
  const stream = randomStream(coaching.rngState);
  let next: Coaching = letGo(coaching, isJudgingDay ? sackings(country, stream.next) : [], date, "fired", true);
  const statures = staturesByStrength(Object.values(country.clubs));
  const season = Number(date.slice(0, 4));
  for (const clubId of due) next = hire(next, { clubId, country: id, stature: statures.get(clubId) ?? 0, prefix: `${id}:`, season, date }, () => id, stream.next);
  if (next === coaching && stream.state() === coaching.rngState) return country;
  return { ...country, coaching: { ...coaching, ...next, rngState: stream.state() } };
}

/** Every result-only country's coaches after the day played; the same world when none moved. */
export function moveWorldCoaches(world: World, date: IsoDate): World {
  let isChanged = false;
  const moved = Object.fromEntries(
    Object.entries(world).map(([id, country]) => {
      const next = moveCountryCoaches(id, country, date);
      isChanged ||= next !== country;
      return [id, next];
    }),
  );
  return isChanged ? moved : world;
}
