import type { GameState } from "../gameState.js";
import { competitionKey, type CompetitionKey } from "../history/history.js";
import { isClassico } from "../rivalries/rivalryOf.js";
import type { TitleStory } from "./careerMoments.js";
import { IDOL_LINE, idolStandingOf, type HumanCoach } from "./idolStanding.js";

const VETERANS_SHOWN = 4;
// Title celebrations scale with the story behind them, from about 2 s to 10 s (SPEC §14).
const SHORTEST_S = 2;
const LONGEST_S = 10;
// guess: each piece of story is worth this much weight; seven of it gets the longest party.
const FULL_WEIGHT = 7;
const PER_SEASON_WAITED = 0.7;
const MAX_SEASONS_WAITED = 5;
const PER_DROUGHT_SEASON = 0.35;
const MAX_DROUGHT_SEASONS = 10;
const PER_LOST_FINAL = 1.2;
const PER_RUNNER_UP = 0.5;
const MAX_NEAR_MISSES = 2;
const RIVAL_BEATEN = 0.8;
const FIRST_TITLE_ANYWHERE = 0.6;
const ALREADY_IDOL = 0.4;
/** From this many seconds up, the screen tells the long story: the drought counter, the near misses, the veterans. */
export const LONG_CELEBRATION_S = 6;

/** The first season the game played: its oldest filed season, or the one under way. */
function firstSeasonOf(state: Pick<GameState, "history" | "season">): number {
  return state.history.seasons[0]?.season ?? state.season;
}

/**
 * The context of a title the seated coach's club won this season: how long he waited at the club, how long
 * the club waited (in this game), the finals and second places it lost with him, the rival it beat, whether
 * the fans already had him as an idol, how many titles he has, and who stayed with him from the start.
 */
export function titleStoryOf(state: GameState, coach: HumanCoach, clubId: string, competition: CompetitionKey, season: number, standingBefore: number): TitleStory {
  const { record } = coach;
  const spell = record.stints.findLast((stint) => stint.clubId === clubId);
  const spellFrom = spell ? Number(spell.from.slice(0, 4)) : season;
  const lastWon = state.history.seasons.findLast((filed) => filed.season < season && filed.champions[competition] === clubId)?.season ?? null;
  const kept = (record.keptMatches ?? []).filter((match) => match.clubId === clubId && match.season >= spellFrom);
  const lostFinals = kept.filter((match) => match.kind === "final" && !match.isWon && match.season <= season).map((match) => ({ season: match.season, competition: competitionKey(match.fixture.competitionId) }));
  const runnerUps = state.history.seasons.filter((filed) => filed.season >= spellFrom && Object.values(filed.tables).some((table) => table[1] === clubId)).map((filed) => filed.season);
  const decided = kept.findLast((match) => match.season === season && match.isWon && competitionKey(match.fixture.competitionId) === competition);
  const opponentId = decided ? (decided.fixture.homeId === clubId ? decided.fixture.awayId : decided.fixture.homeId) : null;
  const firstPage = (record.album ?? []).find((page) => page.clubId === clubId && page.season >= spellFrom);
  const stayed = firstPage && firstPage.season < season ? firstPage.stickers.filter(([id, , , apps]) => apps > 0 && state.players[id]?.clubId === clubId) : [];
  const veterans = [...stayed].sort((a, b) => b[3] - a[3]).slice(0, VETERANS_SHOWN).map(([id]) => id);
  return {
    seasonInSpell: season - spellFrom + 1,
    lastWon,
    droughtFrom: lastWon ?? firstSeasonOf(state),
    lostFinals: lostFinals.filter((final) => final.season < season || final.competition !== competition),
    runnerUps: runnerUps.filter((filed) => filed < season),
    rivalId: opponentId && isClassico(clubId, opponentId) ? opponentId : null,
    wasIdol: standingBefore >= IDOL_LINE,
    careerTitles: record.trophies.length,
    veterans,
    decider: decided ? { homeId: decided.fixture.homeId, awayId: decided.fixture.awayId, homeGoals: decided.fixture.result.homeGoals, awayGoals: decided.fixture.result.awayGoals } : null,
  };
}

/** How long the title's party lasts, in seconds: quick and happy with no story behind it, long after years of waiting and near misses. */
export function celebrationSeconds(story: TitleStory, season: number): number {
  const waited = Math.min(MAX_SEASONS_WAITED, story.seasonInSpell - 1);
  const drought = Math.min(MAX_DROUGHT_SEASONS, Math.max(0, season - story.droughtFrom - 1));
  const weight =
    PER_SEASON_WAITED * waited +
    PER_DROUGHT_SEASON * drought +
    PER_LOST_FINAL * Math.min(MAX_NEAR_MISSES, story.lostFinals.length) +
    PER_RUNNER_UP * Math.min(MAX_NEAR_MISSES, story.runnerUps.length) +
    (story.rivalId ? RIVAL_BEATEN : 0) +
    (story.careerTitles === 1 ? FIRST_TITLE_ANYWHERE : 0) +
    (story.wasIdol ? ALREADY_IDOL : 0);
  return Math.round((SHORTEST_S + (LONGEST_S - SHORTEST_S) * Math.min(1, weight / FULL_WEIGHT)) * 10) / 10;
}

/** The fans' standing of the coach at the club before a title, without it: what the party adds shows on the screen. */
export function standingWithout(state: Pick<GameState, "date" | "rivalries">, coach: HumanCoach, clubId: string, titles: number): number {
  const record = { ...coach.record, trophies: coach.record.trophies.slice(0, Math.max(0, coach.record.trophies.length - titles)) };
  return idolStandingOf(state, { ...coach, record }, clubId).points;
}
