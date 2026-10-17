import { copyRecord } from "../copyRecord.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { formOfTheDay } from "../live/formOfTheDay.js";
import { drawMatchPlay } from "../live/matchPlay.js";
import { clubMood } from "../morale/clubMood.js";
import { fatigueOn } from "../players/fatigueOn.js";
import type { LiveMatch } from "../live/liveDay.js";
import { matchRatings } from "../live/matchRatings.js";
import { competitionKey, type CompetitionKey, type SeasonMark } from "./history.js";
import type { MatchSheets } from "./recordMatches.js";

/**
 * Adds today's full-tier matches to the season's tallies: one rated game per player who took part,
 * his match rating (matchRatings) in tenths, and his assists, per competition. The awards read them.
 * `kickOff` is the game the day kicked off from: a match saved before players had a play gets it
 * drawn again from there, as kick-off drew it, so it rates as it would have.
 */
export function recordRatings(state: GameState, kickOff: GameState, played: readonly Fixture[], sheets: MatchSheets, matches: readonly LiveMatch[]): GameState {
  if (!played.length) return state;
  const timelines = new Map(matches.map((m) => [m.fixtureId, m]));
  const ratings = { ...state.history.current.ratings };
  const own = new Map<CompetitionKey, Record<string, SeasonMark>>();
  const tallyOf = (key: CompetitionKey) => {
    let tally = own.get(key);
    if (!tally) own.set(key, (tally = ratings[key] = copyRecord(ratings[key] ?? {})));
    return tally;
  };
  for (const fixture of played) {
    const sheet = sheets[fixture.id];
    const match = timelines.get(fixture.id);
    if (!sheet || !match) continue;
    const side = (clubId: string, players: typeof sheet.home) => {
      const cameOn = new Set(match.events.flatMap((e) => (e.type === "substitution" && e.clubId === clubId ? [e.playerId] : [])));
      return { clubId, starters: players.filter((p) => !cameOn.has(p.id)), bench: players.filter((p) => cameOn.has(p.id)) };
    };
    const sides = { home: side(fixture.homeId, sheet.home), away: side(fixture.awayId, sheet.away) };
    const formOf = (p: SimPlayer) => formOfTheDay(kickOff.seed, fixture.id, p.id, { morale: clubMood(kickOff, p.clubId).squad, fatigue: fatigueOn(p, kickOff.date) });
    const play = match.play ?? drawMatchPlay(kickOff.seed, fixture.id, [...sides.home.starters, ...sides.away.starters], [...sides.home.bench, ...sides.away.bench], formOf);
    const rated = matchRatings(sides, match.events, play);
    const tally = tallyOf(competitionKey(fixture.competitionId));
    const assists = new Map<string, number>();
    for (const e of match.events) if (e.type === "goal" && e.assistId) assists.set(e.assistId, (assists.get(e.assistId) ?? 0) + 1);
    for (const { playerId, rating } of [...rated.home, ...rated.away]) {
      const [apps, tenths, passes] = tally[playerId] ?? [0, 0, 0];
      tally[playerId] = [apps + 1, tenths + Math.round(rating * 10), passes + (assists.get(playerId) ?? 0)];
    }
  }
  return { ...state, history: { ...state.history, current: { ...state.history.current, ratings } } };
}
