import { randomStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CoachStint, CompetitionKey } from "../history/history.js";
import type { Country } from "../world/world.js";
import { fullTierClubs, fullTierStatures, inventCoach, type AiCoach, type AiCoachStint, type Coaching, type CoachWorld, type PartStanding, type Rookie, type SeasonPoints, type StandingRow } from "./aiCoaches.js";
import { countryPoints, fullTierPoints, nationalPoints, SEASON_WEIGHTS, type ClubSeasonPoints, type SeasonRuns, type UefaWinner } from "./rankingPoints.js";
import { coachRanking, nationalRanking, partsOf, partStanding, STANDING_PLACES, worldRanking } from "./rankings.js";

/** A retired player of the full tier: his name, his first nationality, the club he retired at, his best strength and his age. */
export type RetiredPlayer = { name: string; nationality: string; clubId: string; peak: number; age: number };

/** The players who retired at this season's turn (`events`), with their best strength from `before`, the game as they last played. */
export function retiredPlayers(before: Pick<GameState, "players" | "history">, events: readonly DayEvent[]): RetiredPlayer[] {
  return events.flatMap((event) => {
    if (event.type !== "playerRetired") return [];
    const marks = before.history.strength[event.playerId] ?? [];
    const player = before.players[event.playerId];
    const peak = Math.max(player?.strength ?? 0, ...marks.map((mark) => mark.strength));
    return [{ name: event.name, nationality: player?.nationalities[0] ?? "Brazil", clubId: event.clubId, peak, age: event.age }];
  });
}

// guess: a player who peaked at 76 or more (a Série A regular's 72 plus a margin) was a star.
const STAR_PEAK = 76;
// guess: a retired star starts coaching two to four seasons later.
const ROOKIE_WAIT = { min: 2, span: 3 };
// guess: his name is worth this much reputation on day one, more for the bigger stars and clubs.
const ROOKIE_REPUTATION = 30;
const ROOKIE_REPUTATION_PER_PEAK_POINT = 3;
const ROOKIE_REPUTATION_PER_STATURE = 1 / 4;
// guess: AI coaches retire at 72; one out of work retires earlier now and then, and for good after two seasons without a club.
const RETIREMENT_AGE = 72;
const IDLE_RETIREMENT_CHANCE = 0.12;
const IDLE_SEASONS = 2;

/** The ranking key of a human coach: his name in a hot-seat game, empty in a one-coach game. */
export const humanKey = (name: string | undefined): string => `human:${name ?? ""}`;

/** Days of `stint` inside the season, the year from 1 January to 31 December. */
function daysIn(stint: { from: IsoDate; until: IsoDate | null }, season: number): number {
  const start = Math.max(Date.parse(stint.from), Date.parse(`${season}-01-01`));
  const end = Math.min(stint.until === null ? Infinity : Date.parse(stint.until), Date.parse(`${season + 1}-01-01`));
  return Math.max(0, (end - start) / 86_400_000);
}

/** The clubs a coach ran in the season, each with the share of the year he ran it. */
function creditsOf(stints: readonly (AiCoachStint | CoachStint)[], season: number): [string, number][] {
  const yearDays = daysIn({ from: `${season}-01-01`, until: `${season + 1}-01-01` }, season);
  return stints.flatMap((stint): [string, number][] => {
    const days = daysIn(stint, season);
    return days > 0 ? [[stint.clubId, Math.round((1000 * days) / yearDays) / 1000]] : [];
  });
}

/** A title of the season: the competition, its champion and the day of its final. */
type Title = [competition: CompetitionKey, clubId: string, finalDay: IsoDate];

/** The AI coach who ran `clubId` on `day`, the one who left that day included. */
const inChargeOn = (coaching: Coaching, clubId: string, day: IsoDate): AiCoach | undefined =>
  Object.values(coaching.coaches).find((coach) => coach.stints.some((stint) => stint.clubId === clubId && stint.from <= day && (stint.until === null || stint.until >= day)));

/** The coaching after the season: titles credited to the coaches in charge on the day of each final, each coach's share of his clubs' season, the old ones retired and their jobs open. */
function closeCoaching<T extends Coaching>(coaching: T, season: number, points: ClubSeasonPoints, titles: readonly Title[], date: IsoDate, nextSeason: number, random: () => number, humans: Record<string, [string, number][]> = {}): T {
  const coaches: Record<string, AiCoach> = { ...coaching.coaches };
  for (const [competition, clubId, finalDay] of titles) {
    const coach = inChargeOn(coaching, clubId, finalDay);
    if (coach) coaches[coach.id] = { ...coach, titles: [...(coaches[coach.id]?.titles ?? coach.titles), { season, competition, clubId }] };
  }
  const credits: SeasonPoints["credits"] = {};
  for (const coach of Object.values(coaches)) {
    const own = creditsOf(coach.stints, season);
    if (own.length) credits[coach.id] = own;
  }
  for (const [key, own] of Object.entries(humans)) if (own.length) credits[key] = own;
  const openJobs = { ...coaching.openJobs };
  for (const coach of Object.values(coaches)) {
    if (coach.retiredIn !== undefined) continue;
    const isOld = nextSeason - coach.born >= RETIREMENT_AGE;
    const lastJobEnded = coach.clubId === null ? coach.stints.at(-1)?.until : null;
    const isLongIdle = !!lastJobEnded && lastJobEnded < `${nextSeason - IDLE_SEASONS}-01-01`;
    if (!isOld && !isLongIdle && (coach.clubId !== null || random() >= IDLE_RETIREMENT_CHANCE)) continue;
    if (coach.clubId) openJobs[coach.clubId] = date;
    const stints = coach.stints.map((stint) => (stint.until === null ? { ...stint, until: date, left: "retired" as const } : stint));
    coaches[coach.id] = { ...coach, clubId: null, stints, retiredIn: nextSeason };
  }
  return { ...coaching, coaches, openJobs, seasons: [...coaching.seasons, { season, ...points, credits }] };
}

/** A result-only country's coaches at Brazil's turn of the season: its seasons filed since last time ranked and credited. */
function closeCountry(country: Country, season: number, uefaWinners: readonly UefaWinner[], date: IsoDate, nextSeason: number): Country {
  const { coaching } = country;
  if (!coaching || country.isFullTier) return country;
  const stream = randomStream(coaching.rngState);
  const filed = country.seasons.slice(coaching.filed);
  const id = country.structure.id;
  // A season filed before its finals' days were kept counts its titles as of today.
  const titles = filed.flatMap((record): Title[] => [
    ...(record.champions[0] ? [[`${id}-1`, record.champions[0], record.finals?.league ?? date] satisfies Title] : []),
    ...(record.cup ? [[`${id}-cup`, record.cup.championId, record.finals?.cup ?? date] satisfies Title] : []),
  ]);
  const closed = closeCoaching(coaching, season, countryPoints(country, coaching.filed, uefaWinners), titles, date, nextSeason, stream.next);
  return { ...country, coaching: { ...closed, filed: country.seasons.length, rngState: stream.state() } };
}

// guess: a coach's page shows his last five spells; the ones before are forgotten.
const STINTS_KEPT = 5;

const isHuman = (key: string) => key.startsWith(humanKey(""));

/** Each country's best rows with points, and the human coaches' rows whatever they hold. */
function topByCountry(rows: readonly StandingRow[]): StandingRow[] {
  const byCountry = new Map<string, StandingRow[]>();
  for (const row of rows) if (row[2] > 0 || isHuman(row[0])) byCountry.set(row[1], [...(byCountry.get(row[1]) ?? []), row]);
  return [...byCountry.values()].flatMap((group) => group.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])).filter((row, index) => index < STANDING_PLACES || isHuman(row[0])));
}

const rounded = (rows: readonly StandingRow[]): StandingRow[] => rows.map(([key, country, points]) => [key, country, Math.round(points)]);

/** The coaching with `standing` kept for its season. */
const withStanding = <T extends Coaching>(coaching: T, standing: PartStanding): T => ({ ...coaching, standings: [...(coaching.standings ?? []).filter((kept) => kept.season !== standing.season), standing] });

/** A retired coach as history keeps him: his spells at the clubs he won titles with, or his last one. */
function compactRetired(coach: AiCoach): AiCoach {
  const titled = coach.stints.filter((stint) => coach.titles.some((title) => title.clubId === stint.clubId));
  return { ...coach, stints: titled.length ? titled : coach.stints.slice(-1) };
}

/** The coaching with only the seasons the rankings read from `from` on, each coach's last spells, and the retired coaches nobody remembers gone. */
function forget<T extends Coaching>(coaching: T, from: number, remembered: ReadonlySet<string>): T {
  const seasons = coaching.seasons.filter((filed) => filed.season >= from);
  const credited = new Set(seasons.flatMap((filed) => Object.keys(filed.credits)));
  const coaches: Record<string, AiCoach> = {};
  for (const coach of Object.values(coaching.coaches)) {
    const isRemembered = coach.retiredIn === undefined || coach.titles.length > 0 || remembered.has(coach.id) || credited.has(coach.id);
    if (!isRemembered) continue;
    const kept = coach.retiredIn === undefined ? coach : compactRetired(coach);
    coaches[coach.id] = kept.stints.length > STINTS_KEPT ? { ...kept, stints: kept.stints.slice(-STINTS_KEPT) } : kept;
  }
  return { ...coaching, seasons, coaches };
}

/** The coach keys a part's kept standings name. */
const rememberedIn = (coaching: Coaching): Set<string> => new Set((coaching.standings ?? []).flatMap((standing) => standing.coaches.map(([key]) => key)));

/**
 * The game after each part keeps the season's standing and forgets what the rankings no longer read:
 * points older than the five seasons they weigh, spells beyond a coach's last five, retired coaches
 * with no title, no recent points and no place in a kept standing. The full tier keeps every country's
 * top rows of its own, so it keeps the same whatever world plays beside it; a result-only country keeps
 * the rows that made the world's top. Rows keep raw points, weighed by country when read.
 */
function keepStandings(state: GameState, season: number): GameState {
  const world = state.coaches;
  if (!world) return state;
  const [fullTier, ...countryParts] = partsOf(state);
  const own = fullTier ? partStanding(fullTier, season) : { season, clubs: [], coaches: [] };
  const national = nationalRanking(state, season).slice(0, STANDING_PLACES);
  const kept = withStanding(world, { season, clubs: rounded(topByCountry(own.clubs)), coaches: rounded(topByCountry(own.coaches)), national });
  const from = season - SEASON_WEIGHTS.length + 1;
  const coaches: CoachWorld = { ...forget(kept, from, rememberedIn(kept)), national: world.national.filter((filed) => filed.season >= from) };
  if (!state.world || !countryParts.length) return { ...state, coaches };
  const topClubs = new Set(worldRanking(state, season).slice(0, STANDING_PLACES).map(([key]) => key));
  const topCoaches = new Set(coachRanking(state, season).slice(0, STANDING_PLACES).map(([key]) => key));
  const countries = Object.fromEntries(
    Object.entries(state.world).map(([id, country]) => {
      if (!country.coaching || country.isFullTier) return [id, country];
      const standing = partStanding({ coaching: country.coaching, countryOf: () => id }, season);
      const atTop = (keys: ReadonlySet<string>) => (rows: readonly StandingRow[]) => rounded(rows.filter(([key]) => keys.has(key)));
      const coaching = withStanding(country.coaching, { season, clubs: atTop(topClubs)(standing.clubs), coaches: atTop(topCoaches)(standing.coaches) });
      return [id, { ...country, coaching: forget(coaching, from, rememberedIn(coaching)) }];
    }),
  );
  return { ...state, coaches, world: countries };
}

/**
 * The coaches' turn of the season (`season`, the one just played; `state` already in the next): every
 * club's ranking points and every coach's share of them filed, titles credited to the AI coaches in
 * charge, retired stars queued to start coaching a few seasons on and those due joining the full tier's
 * pool, old coaches retiring and their jobs opening, and the season's standings kept while what the
 * rankings no longer read is forgotten. `runs` are the season as it ended (seasonRuns), read before its
 * fixtures went. Each result-only country files its own on its own stream.
 */
export function closeCoachSeason(state: GameState, season: number, runs: SeasonRuns, retired: readonly RetiredPlayer[]): GameState {
  const world = state.coaches;
  if (!world) return state;
  const stream = randomStream(world.rngState);
  const random = stream.next;
  const uefaWinners = state.europe?.winners.slice(world.uefaFiled ?? 0) ?? [];
  const clubs = fullTierClubs(state);
  const national = nationalPoints(state.history, season, runs.cups);
  const points = fullTierPoints(state.history, season, runs, uefaWinners, (clubId) => clubs.has(clubId));
  const champions = Object.entries(state.history.seasons.find((record) => record.season === season)?.champions ?? {});
  const titles = champions.map(([competition, clubId]): Title => [competition, clubId, runs.finals[competition] ?? `${season}-12-31`]);
  const humans = {
    [humanKey(state.coachName)]: creditsOf(state.history.coach.stints, season),
    ...Object.fromEntries((state.waitingCoaches ?? []).map((waiting) => [humanKey(waiting.name), creditsOf(waiting.record.stints, season)])),
  };
  let closed: CoachWorld = closeCoaching(world, season, points, titles, state.date, state.season, random, humans);

  const statures = fullTierStatures(state);
  const queued: Rookie[] = retired
    .filter((player) => player.peak >= STAR_PEAK)
    .map((player) => ({
      name: player.name,
      born: season - player.age,
      nationality: player.nationality,
      clubId: player.clubId,
      strength: player.peak,
      reputation: Math.min(100, ROOKIE_REPUTATION + ROOKIE_REPUTATION_PER_PEAK_POINT * (player.peak - STAR_PEAK) + ROOKIE_REPUTATION_PER_STATURE * (statures.get(player.clubId) ?? 0)),
      season: season + ROOKIE_WAIT.min + Math.floor(random() * ROOKIE_WAIT.span),
    }));
  const rookies = [...closed.rookies, ...queued];
  const coaches = { ...closed.coaches };
  let { nextId } = closed;
  for (const rookie of rookies.filter((r) => r.season <= state.season)) {
    const coach = inventCoach({ nextId }, "", clubs.get(rookie.clubId) ?? "br", rookie.reputation, state.season, null, null, random);
    coaches[coach.id] = { ...coach, name: rookie.name, born: rookie.born, nationality: rookie.nationality, formerPlayer: { clubId: rookie.clubId, strength: rookie.strength } };
    nextId += 1;
  }
  closed = {
    ...closed,
    nextId,
    coaches,
    rookies: rookies.filter((r) => r.season > state.season),
    national: [...closed.national, { season, clubs: national }],
    ...(state.europe ? { uefaFiled: state.europe.winners.length } : {}),
    rngState: stream.state(),
  };
  const countries = state.world && Object.fromEntries(Object.entries(state.world).map(([id, country]) => [id, closeCountry(country, season, uefaWinners, state.date, state.season)]));
  return keepStandings({ ...state, coaches: closed, ...(countries ? { world: countries } : {}) }, season);
}
