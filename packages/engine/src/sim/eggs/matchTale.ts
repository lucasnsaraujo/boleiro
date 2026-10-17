import type { PositionGroup } from "../../engine/match.js";
import type { Fixture, GameState, MatchResult } from "../gameState.js";
import type { MatchPlay } from "../live/matchPlay.js";
import type { MatchEvent } from "../live/matchTimeline.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import type { MatchTale } from "./eggType.js";
import { woodworkOf } from "./woodwork.js";

type Story = { events: readonly MatchEvent[]; play: MatchPlay | null };

/** Whether the fixture is the last match of its competition's final. */
function isFinalOf(state: Pick<GameState, "competitions" | "fixtures">, fixture: Fixture): boolean {
  const stage = state.competitions[fixture.competitionId]?.stages[fixture.stage];
  if (stage?.kind !== "knockout" || stage.ties.length !== 1) return false;
  return !state.fixtures.some((f) => f.competitionId === fixture.competitionId && f.stage === fixture.stage && f.date > fixture.date);
}

/**
 * Whether the player arrived at the club during the game: an academy kid moved up, or a player the save
 * saw play for another club, who has not played for this one yet.
 */
function isDebut(history: GameState["history"], clubId: string, playerId: string): boolean {
  if (history.players[clubId]?.[playerId]) return false;
  return playerId.startsWith("k") || Object.entries(history.players).some(([otherId, players]) => otherId !== clubId && players[playerId] !== undefined);
}

/**
 * A played match as the eggs read it, from its story (its timeline and its players' play): `state` gives
 * names, ages, rivals and the competition, `history` the appearances before the match, `coachNames` the
 * game's human coaches.
 */
export function matchTaleOf(
  state: Pick<GameState, "seed" | "clubs" | "players" | "competitions" | "fixtures">,
  history: GameState["history"],
  fixture: Fixture & { result: MatchResult },
  story: Story,
  coachNames: readonly string[],
): MatchTale {
  const groups: Record<string, PositionGroup> = {};
  const clubOf: Record<string, string> = {};
  const ages: Record<string, number> = {};
  const names: Record<string, string> = {};
  const tookPart = new Set([...(story.play?.starters ?? []), ...story.events.flatMap((e) => (e.type === "substitution" ? [e.playerId] : []))]);
  for (const [playerId, own] of Object.entries(story.play?.players ?? {})) {
    clubOf[playerId] = own.clubId;
    const player = state.players[playerId];
    if (player) names[playerId] = player.name;
    if (!tookPart.has(playerId)) continue;
    groups[playerId] = own.group;
    if (player) ages[playerId] = player.age;
  }
  // Only a scorer's debut is ever news, so only the scorers are looked up.
  const scorers = new Set(story.events.flatMap((e) => (e.type === "goal" && e.kind !== "ownGoal" ? [e.playerId] : [])));
  const debutants = new Set([...scorers].filter((playerId) => clubOf[playerId] && isDebut(history, clubOf[playerId], playerId)));
  return {
    fixture,
    isFinal: isFinalOf(state, fixture),
    isDerby: rivalsOf(state.clubs).get(fixture.homeId)?.has(fixture.awayId) ?? false,
    events: story.events,
    groups,
    clubOf,
    ages,
    names,
    woodwork: story.play ? woodworkOf(state.seed, fixture.id, story.play, story.events) : [],
    debutants,
    coachNames,
  };
}
