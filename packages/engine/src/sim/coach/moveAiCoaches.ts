import { randomStream } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";
import { leagueTable } from "../world/resultOnlyLeague.js";
import type { ResultOnlyLeague, WorldClub } from "../world/world.js";
import { clubsOfWorld, coachesByClub, inventCoach, worldStatures, type AiCoach, type CoachWorld } from "./aiCoaches.js";
import { humanClubIds, waitingCoachesOf } from "./humanCoaches.js";
import { OFFER_DAYS } from "./offerJobs.js";

/** An AI club named its new head coach. */
export type CoachAppointed = { type: "coachAppointed"; clubId: string; coachId: string; name: string };

// guess: a fired coach's name is worth a little less on the market.
const FIRED_REPUTATION_COST = 3;
// guess: a club looks for a coach whose reputation is close to its stature, at home first.
const SAME_COUNTRY_PREFERENCE = 12;
const PICK_NOISE = 6;
// guess: no one in the pool within this many points of the club's stature, at home or abroad, and the club promotes someone new.
const FIT_RANGE = 20;
/**
 * The result-only world's sackings, judged on the first of each month from the league table against
 * the order of the clubs' squad strength. Calibrated so about 57% of its clubs change coach in a season:
 * CIES counted 484 of 850 teams in 2022/23 (56.9%) across its leagues
 * (https://football-observatory.com/Less-than-one-in-two-coaches-finished-the-season).
 */
const MONTHLY_SACKING = 0.09;
const UNDERPERFORMANCE_WEIGHT = 2.5;
// guess: no club abroad judges its coach before four rounds.
const GRACE_ROUNDS = 4;

const close = (coach: AiCoach, date: IsoDate, left: "fired" | "replaced"): AiCoach => ({
  ...coach,
  clubId: null,
  reputation: left === "fired" ? Math.max(0, coach.reputation - FIRED_REPUTATION_COST) : coach.reputation,
  stints: coach.stints.map((stint) => (stint.until === null ? { ...stint, until: date, left } : stint)),
});

/** Whether a human coach holds an open offer from the club: it waits for his answer before it hires someone else. */
function isWaitingForHuman(state: GameState, clubId: string): boolean {
  const offers = [state.coach, ...waitingCoachesOf(state).map((waiting) => waiting.coach)].flatMap((coach) => coach.offers);
  return offers.some((offer) => offer.clubId === clubId && offer.expiresOn >= state.date);
}

/** How many rounds of the league are played. */
function roundsPlayed(league: ResultOnlyLeague): number {
  let played = 0;
  for (let i = 0; i < league.results.length; i += 2) if (league.results[i] !== "-") played++;
  return played / Math.max(1, Math.floor(league.clubIds.length / 2));
}

function squadStrength(club: WorldClub | undefined): number {
  if (!club) return 0;
  const best = [...club.strengths].sort((a, b) => b - a).slice(0, 14);
  return best.reduce((sum, s) => sum + s, 0) / Math.max(1, best.length);
}

/** The result-only clubs whose boards sack their coach on the first of a month, worst runs first in no particular order. */
function worldSackings(state: GameState, random: () => number): string[] {
  const sacked: string[] = [];
  for (const country of Object.values(state.world ?? {})) {
    for (const league of country.leagues) {
      if (roundsPlayed(league) < GRACE_ROUNDS || roundsPlayed(league) >= (league.dates.length || 1)) continue;
      const table = leagueTable(league);
      const expected = [...league.clubIds].sort((a, b) => squadStrength(country.clubs[b]) - squadStrength(country.clubs[a]) || a.localeCompare(b));
      for (const clubId of [...league.clubIds].sort()) {
        const gap = (table.indexOf(clubId) - expected.indexOf(clubId)) / league.clubIds.length;
        if (random() < MONTHLY_SACKING * Math.max(0, 1 + UNDERPERFORMANCE_WEIGHT * gap)) sacked.push(clubId);
      }
    }
  }
  return sacked;
}

/** The pool coach the club hires: the closest reputation to its stature, at home first; or a new local coach when nobody fits. */
function hire(world: CoachWorld, clubId: string, country: string, stature: number, countryOf: Map<string, string>, season: number, date: IsoDate, random: () => number): AiCoach {
  let best: AiCoach | null = null;
  let bestScore = -Infinity;
  for (const coach of Object.values(world.coaches)) {
    if (coach.clubId !== null) continue;
    const lastClub = coach.stints.at(-1)?.clubId;
    // A coach doesn't go straight back to the club that just let him go.
    if (lastClub === clubId) continue;
    const home = (lastClub ? countryOf.get(lastClub) : undefined) === country;
    const distance = Math.abs(coach.reputation - stature);
    if (distance > FIT_RANGE) continue;
    const score = -distance + (home ? SAME_COUNTRY_PREFERENCE : 0) + random() * PICK_NOISE;
    if (score > bestScore) {
      best = coach;
      bestScore = score;
    }
  }
  const coach = best ?? inventCoach(world, country, stature, season, null, null, random);
  return { ...coach, clubId, stints: [...coach.stints, { clubId, from: date, until: null, left: null }] };
}

/**
 * The AI coaches' part of a day (`date`, the day played): the coaches the boards fired today (`fired`)
 * go to the free pool and their jobs open; the result-only world's boards judge theirs on the first
 * of the month; a club a human coach left opens its job, a club one took lets its AI coach go; and
 * every job open for two weeks, with no human weighing its offer, goes to the pool's best fit. Runs on
 * the coaches' own stream.
 */
export function moveAiCoaches(state: GameState, before: GameState, fired: readonly string[], date: IsoDate): { state: GameState; events: CoachAppointed[] } {
  const world = state.coaches;
  if (!world) return { state, events: [] };
  const stream = randomStream(world.rngState);
  const random = stream.next;
  const humans = new Set(humanClubIds(state));
  const humansBefore = new Set(humanClubIds(before));
  const newHumans = [...humans].filter((id) => !humansBefore.has(id));
  const formerHumans = [...humansBefore].filter((id) => !humans.has(id));
  const sackings = date.endsWith("-01") ? worldSackings(state, random) : [];
  const due = Object.entries(world.openJobs).filter(([clubId, opened]) => addDays(opened, OFFER_DAYS) <= date && !humans.has(clubId) && !isWaitingForHuman(state, clubId));
  if (!fired.length && !newHumans.length && !formerHumans.length && !sackings.length && !due.length) {
    return { state: stream.state() === world.rngState ? state : { ...state, coaches: { ...world, rngState: stream.state() } }, events: [] };
  }

  const coaches = { ...world.coaches };
  const openJobs = { ...world.openJobs };
  const byClub = coachesByClub(world);
  const leave = (clubId: string, left: "fired" | "replaced") => {
    const coach = byClub.get(clubId);
    if (coach) coaches[coach.id] = close(coach, date, left);
    byClub.delete(clubId);
  };
  for (const clubId of [...fired, ...sackings]) {
    if (humans.has(clubId)) continue;
    leave(clubId, "fired");
    openJobs[clubId] = date;
  }
  for (const clubId of newHumans) {
    leave(clubId, "replaced");
    Reflect.deleteProperty(openJobs, clubId);
  }
  for (const clubId of formerHumans) if (!byClub.has(clubId)) openJobs[clubId] = date;

  const events: CoachAppointed[] = [];
  let next: CoachWorld = { ...world, coaches, openJobs };
  if (due.length) {
    const countryOf = clubsOfWorld(state);
    const statures = worldStatures(state);
    for (const [clubId] of due.sort(([a], [b]) => a.localeCompare(b))) {
      if (!(clubId in next.openJobs)) continue;
      const hired = hire(next, clubId, countryOf.get(clubId) ?? "br", statures.get(clubId) ?? 0, countryOf, state.season, date, random);
      const isNew = !(hired.id in next.coaches);
      const remaining = { ...next.openJobs };
      Reflect.deleteProperty(remaining, clubId);
      next = { ...next, nextId: next.nextId + (isNew ? 1 : 0), coaches: { ...next.coaches, [hired.id]: hired }, openJobs: remaining };
      events.push({ type: "coachAppointed", clubId, coachId: hired.id, name: hired.name });
    }
  }
  return { state: { ...state, coaches: { ...next, rngState: stream.state() } }, events };
}
