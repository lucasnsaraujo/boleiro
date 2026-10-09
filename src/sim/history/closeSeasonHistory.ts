import type { Division } from "../../data/players.js";
import type { Fixture, GameState, LeagueCompetition } from "../gameState.js";
import { LEAGUE_FORMATS } from "../leagueFormats.js";
import { standings } from "../standings.js";
import { championOf } from "./championOf.js";
import { competitionKey, type History, type PlayerAtClub, type SeasonRecord, type TopScorer } from "./history.js";

// guess: a player who left a club after fewer games than this is not worth remembering there; it keeps
// the per-club tallies from growing with every loanee and youth player who passed through.
const FORGET_BELOW_APPS = 10;

/**
 * A league's final order: the champion, then clubs by the last stage they reached, then by points over
 * the whole competition. For single-table leagues that is the table itself.
 */
function finalOrder(competition: LeagueCompetition, fixtures: readonly Fixture[], championId: string | null): string[] {
  const reached = new Map<string, number>();
  for (const f of fixtures) {
    for (const id of [f.homeId, f.awayId]) reached.set(id, Math.max(reached.get(id) ?? 0, f.stage));
  }
  const overall = standings(competition.clubIds, fixtures, competition.drawOrder).map((row) => row.clubId);
  return [...overall].sort(
    (a, b) => Number(b === championId) - Number(a === championId) || (reached.get(b) ?? 0) - (reached.get(a) ?? 0) || overall.indexOf(a) - overall.indexOf(b),
  );
}

function topScorerOf(goals: Record<string, number>, state: GameState): TopScorer | null {
  const [best] = Object.entries(goals).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  if (!best) return null;
  const [playerId, count] = best;
  const player = state.players[playerId];
  const known = Object.entries(state.history.players).find(([, players]) => playerId in players);
  return {
    playerId,
    name: player?.name ?? known?.[1][playerId]?.name ?? playerId,
    clubId: player?.clubId ?? known?.[0] ?? "",
    goals: count,
  };
}

function forgetPassersBy(state: GameState): History["players"] {
  return Object.fromEntries(
    Object.entries(state.history.players).map(([clubId, players]) => [
      clubId,
      Object.fromEntries(Object.entries(players).filter(([id, p]: [string, PlayerAtClub]) => p.apps >= FORGET_BELOW_APPS || state.players[id]?.clubId === clubId)),
    ]),
  );
}

/** Files the season that just finished, before its competitions and fixtures are replaced by the next one's. */
export function closeSeasonHistory(state: GameState): GameState {
  const { history } = state;
  const empty = (): Record<Division, string[]> => ({ A: [], B: [], C: [], D: [] });
  const record: SeasonRecord = { season: state.season, champions: { ...history.current.champions }, topScorers: {}, promoted: empty(), relegated: empty(), tables: empty() };
  const fixturesOf = new Map<string, Fixture[]>();
  for (const f of state.fixtures) {
    const own = fixturesOf.get(f.competitionId) ?? [];
    own.push(f);
    fixturesOf.set(f.competitionId, own);
  }
  for (const competition of Object.values(state.competitions)) {
    const fixtures = fixturesOf.get(competition.id) ?? [];
    const key = competitionKey(competition.id);
    const championId = record.champions[key] ?? championOf(competition, fixtures);
    if (championId) record.champions[key] = championId;
    if (competition.kind !== "league") continue;
    const outcome = LEAGUE_FORMATS[competition.format].outcome(competition, fixtures);
    record.promoted[competition.division] = outcome.promotedIds;
    record.relegated[competition.division] = outcome.relegatedIds;
    record.tables[competition.division] = finalOrder(competition, fixtures, championId);
  }
  for (const [key, goals] of Object.entries(history.current.goals)) {
    const top = topScorerOf(goals, state);
    if (top) record.topScorers[key] = top;
  }
  return {
    ...state,
    history: {
      ...history,
      seasons: [...history.seasons, record],
      current: { season: state.season + 1, champions: {}, goals: {} },
      players: forgetPassersBy(state),
    },
  };
}
