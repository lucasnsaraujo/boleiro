import type { Formation } from "@boleiro/engine/engine/formations";
import type { Posture } from "@boleiro/engine/engine/match";
import { countriesCoaching, everyCoach, fullTierClubs, type AiCoach, type AiCoachStint, type CoachTitle } from "@boleiro/engine/sim/coach/aiCoaches";
import { humanKey } from "@boleiro/engine/sim/coach/closeCoachSeason";
import { jobCentre, type OpenJob } from "@boleiro/engine/sim/coach/jobCentre";
import { coachRanking, nationalRanking, rankedSeasons, STANDING_PLACES, worldRanking } from "@boleiro/engine/sim/coach/rankings";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { coachNameOf, coachRivalriesOf, FREGUESIA_WINS, RIVALRY_POINTS } from "@boleiro/engine/sim/rivalries/coachRivalries";
import { idolClubsOf } from "@boleiro/engine/sim/rivalries/idols";
import type { CoachRecord, CoachStint } from "@boleiro/engine/sim/history/history";

/** A coach's line in the ranking: AI coaches by id, human coaches by humanKey; `isSeated` marks the coach in the seat, `isInvented` a coach the game made up (neither real, an ex-star of the game nor human). */
export type RankedCoach = { position: number; key: string; name: string; clubId: string | null; points: number; isHuman: boolean; isSeated: boolean; isInvented: boolean };

/** A club's line in a ranking, with the country it plays in ("br" for Brazil). */
export type RankedClub = { position: number; clubId: string; points: number; country: string };

/** A spell at a club, an AI coach's or a human's. */
export type ProfileStint = AiCoachStint | CoachStint;

/**
 * Another coach as a coach's profile lists him among his rivals: his record against him (wins and
 * defeats from the profile's coach's side), the finals and press clashes between them, whether the
 * papers call it a rivalry and which of them, if either, is the other's freguês.
 */
export type ProfileRival = {
  key: string;
  name: string;
  clubId: string | null;
  meetings: number;
  wins: number;
  losses: number;
  draws: number;
  finals: number;
  clashes: number;
  isRivalry: boolean;
  fregues: "them" | "us" | null;
};

// The profile shows a coach's most heated rivalries.
const RIVALS_SHOWN = 5;

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
  rivals: ProfileRival[];
  /** The clubs a human coach is an idol of (rivalries/idols.ts); none for an AI coach. */
  idolOf: string[];
};

/**
 * The coaches screen: the rankings as they stood at the end of `season` (the latest ranked when left
 * out; null before the first), the seasons it can show, the result-only countries the latest world
 * ranking still lacks because they haven't finished a season in the game, the job centre for the coach
 * in the seat and his own profile.
 */
export type CoachesPage = {
  season: number | null;
  seasons: number[];
  coaches: RankedCoach[];
  national: RankedClub[];
  world: RankedClub[];
  waitingCountries: string[];
  jobs: OpenJob[];
  you: CoachProfile;
};

// The screen lists the top of each ranking a season keeps for history; the human coaches always show.
const SHOWN = STANDING_PLACES;

type Standing = Map<string, { position: number; points: number }>;

/** A coach's most heated rivalries with other coaches, as his profile lists them. */
function rivalsOf(state: GameState, key: string): ProfileRival[] {
  const aiById = new Map(everyCoach(state).map((coach) => [coach.id, coach]));
  const humans = new Map(humansOf(state).map((human) => [humanKey(human.name), human]));
  return coachRivalriesOf(state, key)
    .slice(0, RIVALS_SHOWN)
    .map((r) => {
      const other = aiById.get(r.opponent);
      const human = humans.get(r.opponent);
      const fregues = r.wins >= FREGUESIA_WINS && r.losses === 0 ? "them" : r.losses >= FREGUESIA_WINS && r.wins === 0 ? "us" : null;
      return {
        key: r.opponent,
        name: coachNameOf(state, r.opponent),
        clubId: other?.clubId ?? human?.clubId ?? null,
        meetings: r.meetings,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        finals: r.finals,
        clashes: r.clashes,
        isRivalry: r.score >= RIVALRY_POINTS,
        fregues,
      };
    });
}

function humanProfile(state: GameState, name: string | undefined, clubId: string | null, reputation: number, record: CoachRecord, standing: Standing): CoachProfile {
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
    rivals: rivalsOf(state, key),
    idolOf: idolClubsOf(state, { name, record }),
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
    rivals: rivalsOf(state, coach.id),
    idolOf: [],
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
    if (human) return [{ position: index + 1, key, name: human.name ?? "", clubId: human.clubId, points, isHuman: true, isSeated: human.isSeated, isInvented: false }];
    const coach = aiById.get(key);
    return coach ? [{ position: index + 1, key, name: coach.name, clubId: coach.clubId, points, isHuman: false, isSeated: false, isInvented: !coach.isReal && !coach.formerPlayer }] : [];
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
    waitingCountries: asOf === undefined || asOf !== seasons.at(-1) ? [] : countriesCoaching(state).flatMap(([id, country]) => (country.seasons.length ? [] : [id])),
    jobs: jobCentre(state),
    you: humanProfile(state, seated?.name, state.coachClubId, state.coach.reputation, state.history.coach, standingOf(ranked)),
  };
}

/** The page of a coach by his ranking key, or by a club's id for its AI coach; null when nobody has it. */
export function coachProfile(state: GameState, key: string): CoachProfile | null {
  const standing = standingOf(coachRanking(state));
  const human = humansOf(state).find((h) => humanKey(h.name) === key);
  if (human) return humanProfile(state, human.name, human.clubId, human.reputation, human.record, standing);
  const coaches = everyCoach(state);
  const coach = coaches.find((c) => c.id === key) ?? coaches.find((c) => c.clubId === key);
  return coach ? aiProfile(state, coach, standing) : null;
}
