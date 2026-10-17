import type { Formation } from "@boleiro/engine/engine/formations";
import type { Posture } from "@boleiro/engine/engine/match";
import { everyCoach, fullTierClubs, type AiCoach, type AiCoachStint, type CoachTitle } from "@boleiro/engine/sim/coach/aiCoaches";
import { humanKey } from "@boleiro/engine/sim/coach/closeCoachSeason";
import { jobCentre, type OpenJob } from "@boleiro/engine/sim/coach/jobCentre";
import { coachRanking, nationalRanking, rankedSeasons, worldRanking } from "@boleiro/engine/sim/coach/rankings";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { CoachRecord, CoachStint } from "@boleiro/engine/sim/history/history";

/** A coach's line in the ranking: AI coaches by id, human coaches by humanKey; `isSeated` marks the coach in the seat. */
export type RankedCoach = { position: number; key: string; name: string; clubId: string | null; points: number; isHuman: boolean; isSeated: boolean };

/** A club's line in a ranking, with the country it plays in ("br" for Brazil). */
export type RankedClub = { position: number; clubId: string; points: number; country: string };

/** A spell at a club, an AI coach's or a human's. */
export type ProfileStint = AiCoachStint | CoachStint;

/**
 * A coach's page: who he is, his career club by club, his titles and where he stands in the ranking.
 * A human coach has no birth year, formation or style of his own in the game; `name` null is the
 * coach in the seat of a one-coach game.
 */
export type CoachProfile = {
  key: string;
  name: string | null;
  isHuman: boolean;
  nationality: string | null;
  age: number | null;
  reputation: number;
  formation: Formation | null;
  style: Posture | null;
  clubId: string | null;
  isReal: boolean;
  formerPlayer: AiCoach["formerPlayer"] | null;
  stints: ProfileStint[];
  titles: CoachTitle[];
  ranking: { position: number; points: number } | null;
};

/**
 * The coaches screen: the rankings as they stood at the end of `season` (the latest ranked when left
 * out; null before the first), the seasons it can show, the job centre for the coach in the seat and
 * his own profile.
 */
export type CoachesPage = {
  season: number | null;
  seasons: number[];
  coaches: RankedCoach[];
  national: RankedClub[];
  world: RankedClub[];
  jobs: OpenJob[];
  you: CoachProfile;
};

// guess: the screen lists the top fifty of each ranking; the human coaches always show.
const SHOWN = 50;

type Standing = Map<string, { position: number; points: number }>;

function humanProfile(name: string | undefined, clubId: string | null, reputation: number, record: CoachRecord, standing: Standing): CoachProfile {
  const key = humanKey(name);
  return {
    key,
    name: name ?? null,
    isHuman: true,
    nationality: null,
    age: null,
    reputation,
    formation: null,
    style: null,
    clubId,
    isReal: false,
    formerPlayer: null,
    stints: record.stints,
    titles: record.trophies,
    ranking: standing.get(key) ?? null,
  };
}

function aiProfile(state: GameState, coach: AiCoach, standing: Standing): CoachProfile {
  return {
    key: coach.id,
    name: coach.name,
    isHuman: false,
    nationality: coach.nationality,
    age: state.season - coach.born,
    reputation: coach.reputation,
    formation: coach.formation,
    style: coach.style,
    clubId: coach.clubId,
    isReal: coach.isReal ?? false,
    formerPlayer: coach.formerPlayer ?? null,
    stints: coach.stints,
    titles: coach.titles,
    ranking: standing.get(coach.id) ?? null,
  };
}

const standingOf = (ranked: readonly [string, number][]): Standing => new Map(ranked.map(([key, points], index) => [key, { position: index + 1, points }]));

/** The human coaches: the one in the seat, then the waiting ones, with the club and record each keeps. */
function humansOf(state: GameState) {
  return [
    { name: state.coachName, clubId: state.coachClubId, reputation: state.coach.reputation, record: state.history.coach, isSeated: true },
    ...(state.waitingCoaches ?? []).map((waiting) => ({ name: waiting.name, clubId: waiting.clubId, reputation: waiting.coach.reputation, record: waiting.record, isSeated: false })),
  ];
}

export function coachesPage(state: GameState, season?: number): CoachesPage {
  const seasons = rankedSeasons(state);
  const asOf = season !== undefined && seasons.includes(season) ? season : seasons.at(-1);
  const ranked = asOf === undefined ? [] : coachRanking(state, asOf);
  const humans = humansOf(state);
  const humanByKey = new Map(humans.map((human) => [humanKey(human.name), human]));
  const aiById = new Map(everyCoach(state).map((coach) => [coach.id, coach]));
  const coaches = ranked.flatMap(([key, points], index): RankedCoach[] => {
    const human = humanByKey.get(key);
    if (index >= SHOWN && !human) return [];
    if (human) return [{ position: index + 1, key, name: human.name ?? "", clubId: human.clubId, points, isHuman: true, isSeated: human.isSeated }];
    const coach = aiById.get(key);
    return coach ? [{ position: index + 1, key, name: coach.name, clubId: coach.clubId, points, isHuman: false, isSeated: false }] : [];
  });
  const countryOf = fullTierClubs(state);
  for (const [id, country] of Object.entries(state.world ?? {})) for (const clubId of Object.keys(country.clubs)) if (!countryOf.has(clubId)) countryOf.set(clubId, id);
  const clubs = (ranking: readonly [string, number][]) => ranking.slice(0, SHOWN).map(([clubId, points], index) => ({ position: index + 1, clubId, points, country: countryOf.get(clubId) ?? "br" }));
  const seated = humans[0];
  return {
    season: asOf ?? null,
    seasons,
    coaches,
    national: asOf === undefined ? [] : clubs(nationalRanking(state, asOf)),
    world: asOf === undefined ? [] : clubs(worldRanking(state, asOf)),
    jobs: jobCentre(state),
    you: humanProfile(seated?.name, state.coachClubId, state.coach.reputation, state.history.coach, standingOf(ranked)),
  };
}

/** The page of a coach by his ranking key, or by a club's id for its AI coach; null when nobody has it. */
export function coachProfile(state: GameState, key: string): CoachProfile | null {
  const standing = standingOf(coachRanking(state));
  const human = humansOf(state).find((h) => humanKey(h.name) === key);
  if (human) return humanProfile(human.name, human.clubId, human.reputation, human.record, standing);
  const coaches = everyCoach(state);
  const coach = coaches.find((c) => c.id === key) ?? coaches.find((c) => c.clubId === key);
  return coach ? aiProfile(state, coach, standing) : null;
}
