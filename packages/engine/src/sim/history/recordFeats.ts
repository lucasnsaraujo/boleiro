import type { Fixture, GameState, IsoDate, SimPlayer } from "../gameState.js";
import { competitionKey, NO_RECORDS, type ClubRecords, type CompetitionKey, type GoalsMark, type LeagueRecords, type RunMark, type ScorerMark } from "./history.js";
import type { MatchSheets } from "./recordMatches.js";

export type RecordKind = "biggestWin" | "mostSeasonGoals" | "longestUnbeaten" | "youngestScorer";

/**
 * A club's or a league's record beaten today, from `previous` to `value`: goals of margin, goals in the
 * season, games unbeaten, or the scorer's age. `playerId` and `name` are the player's, for player records.
 */
export type RecordBroken = {
  type: "recordBroken";
  scope: "club" | "league";
  /** The league, for a league's record. */
  competition: CompetitionKey | null;
  kind: RecordKind;
  clubId: string;
  playerId: string | null;
  name: string | null;
  value: number;
  previous: number;
};

const NO_LEAGUE_RECORDS: LeagueRecords = { biggestWin: null, mostSeasonGoals: null, youngestScorer: null };
// guess: a record beaten is news once it is worth telling: a win by four, ten games unbeaten, fifteen
// goals for a club in a season (eighteen in a league), a scorer of eighteen or younger.
const NOTABLE_MARGIN = 4;
const NOTABLE_RUN = 10;
const NOTABLE_CLUB_GOALS = 15;
const NOTABLE_LEAGUE_GOALS = 18;
const NOTABLE_AGE = 18;

const margin = (goalsFor: number, goalsAgainst: number) => goalsFor - goalsAgainst;

/** The run under way after a game: one more unless it was lost. */
function nextRun(run: RunMark | null | undefined, isLost: boolean, date: IsoDate): RunMark | null {
  return isLost ? null : { games: (run?.games ?? 0) + 1, from: run?.from ?? date, until: date };
}

/**
 * Writes today's matches into the clubs' and leagues' records that recordMatches doesn't keep: longest
 * unbeaten runs, youngest scorers, most goals in a season and each league's biggest win. `before` is
 * the game before recordMatches ran, whose club records tell a biggest win that just fell. Returns the
 * records beaten today that are worth telling: a notable mark that beat someone else's.
 */
export function recordFeats(state: GameState, before: GameState, played: readonly Fixture[], sheets: MatchSheets): { state: GameState; events: RecordBroken[] } {
  if (!played.length) return { state, events: [] };
  const { history } = state;
  const clubs = { ...history.clubs };
  const leagues = { ...history.leagues };
  const events: RecordBroken[] = [];
  const seasonGoals = (playerId: string) => Object.values(history.current.goals).reduce((sum, own) => sum + (own[playerId] ?? 0), 0);
  // A player who joined this season scored for the club no more than his goals there.
  const seasonGoalsFor = (player: SimPlayer, clubId: string) => {
    const goals = seasonGoals(player.id);
    const hasJoinedThisSeason = player.condition.arrivedOn?.slice(0, 4) === String(state.season);
    return hasJoinedThisSeason ? Math.min(goals, history.players[clubId]?.[player.id]?.goals ?? 0) : goals;
  };
  const tell = (event: Omit<RecordBroken, "type">) => events.push({ type: "recordBroken", ...event });

  for (const fixture of played) {
    const sheet = sheets[fixture.id];
    const result = fixture.result;
    if (!sheet || !result) continue;
    const competition = competitionKey(fixture.competitionId);
    const isLeague = state.competitions[fixture.competitionId]?.kind === "league";
    const sides = [
      { clubId: fixture.homeId, opponentId: fixture.awayId, lineup: sheet.home, scorers: sheet.scorers.home, goalsFor: result.homeGoals, goalsAgainst: result.awayGoals },
      { clubId: fixture.awayId, opponentId: fixture.homeId, lineup: sheet.away, scorers: sheet.scorers.away, goalsFor: result.awayGoals, goalsAgainst: result.homeGoals },
    ];
    for (const { clubId, opponentId, lineup, scorers, goalsFor, goalsAgainst } of sides) {
      if (!state.clubs[clubId]) continue;
      const own: ClubRecords = { ...NO_RECORDS, ...clubs[clubId] };
      const was = before.history.clubs[clubId]?.biggestWin;
      const won = own.biggestWin;
      if (was && won && won !== was && margin(won.goalsFor, won.goalsAgainst) >= NOTABLE_MARGIN) {
        tell({ scope: "club", competition: null, kind: "biggestWin", clubId, playerId: null, name: null, value: margin(won.goalsFor, won.goalsAgainst), previous: margin(was.goalsFor, was.goalsAgainst) });
      }
      const run = nextRun(own.unbeaten, goalsFor < goalsAgainst, fixture.date);
      const longest = own.longestUnbeaten ?? null;
      let longestUnbeaten = longest;
      if (run && run.games > (longest?.games ?? 0)) {
        longestUnbeaten = run;
        if (longest && longest.from !== run.from && run.games >= NOTABLE_RUN) {
          tell({ scope: "club", competition: null, kind: "longestUnbeaten", clubId, playerId: null, name: null, value: run.games, previous: longest.games });
        }
      }
      let youngestScorer = own.youngestScorer ?? null;
      let mostSeasonGoals = own.mostSeasonGoals ?? null;
      const ages = new Map(lineup.map((p) => [p.id, p] as const));
      for (const playerId of new Set(scorers)) {
        const player = ages.get(playerId);
        if (!player) continue;
        if (!youngestScorer || player.age < youngestScorer.age) {
          const mark: ScorerMark = { season: state.season, date: fixture.date, competition, playerId, name: player.name, clubId, opponentId, age: player.age };
          if (youngestScorer && youngestScorer.playerId !== playerId && player.age <= NOTABLE_AGE) {
            tell({ scope: "club", competition: null, kind: "youngestScorer", clubId, playerId, name: player.name, value: player.age, previous: youngestScorer.age });
          }
          youngestScorer = mark;
        }
        const goals = seasonGoalsFor(player, clubId);
        if (!mostSeasonGoals || goals > mostSeasonGoals.goals) {
          const isOthers = mostSeasonGoals && (mostSeasonGoals.playerId !== playerId || mostSeasonGoals.season !== state.season);
          if (mostSeasonGoals && isOthers && goals >= NOTABLE_CLUB_GOALS) {
            tell({ scope: "club", competition: null, kind: "mostSeasonGoals", clubId, playerId, name: player.name, value: goals, previous: mostSeasonGoals.goals });
          }
          mostSeasonGoals = { season: state.season, playerId, name: player.name, clubId, goals };
        }
      }
      clubs[clubId] = { ...own, unbeaten: run, longestUnbeaten, youngestScorer, mostSeasonGoals };
    }

    if (!isLeague) continue;
    const records: LeagueRecords = { ...NO_LEAGUE_RECORDS, ...leagues[competition] };
    const best = records.biggestWin;
    let biggestWin = best;
    const winMargin = Math.abs(result.homeGoals - result.awayGoals);
    if (winMargin > (best ? Math.abs(best.homeGoals - best.awayGoals) : 0)) {
      biggestWin = { season: state.season, date: fixture.date, homeId: fixture.homeId, awayId: fixture.awayId, homeGoals: result.homeGoals, awayGoals: result.awayGoals };
      const winnerId = result.homeGoals > result.awayGoals ? fixture.homeId : fixture.awayId;
      if (best && winMargin >= NOTABLE_MARGIN) tell({ scope: "league", competition, kind: "biggestWin", clubId: winnerId, playerId: null, name: null, value: winMargin, previous: Math.abs(best.homeGoals - best.awayGoals) });
    }
    let { youngestScorer, mostSeasonGoals } = records;
    for (const { clubId, lineup, scorers, opponentId } of sides) {
      const byId = new Map(lineup.map((p) => [p.id, p] as const));
      for (const playerId of new Set(scorers)) {
        const player = byId.get(playerId);
        if (!player) continue;
        if (!youngestScorer || player.age < youngestScorer.age) {
          if (youngestScorer && youngestScorer.playerId !== playerId && player.age <= NOTABLE_AGE) {
            tell({ scope: "league", competition, kind: "youngestScorer", clubId, playerId, name: player.name, value: player.age, previous: youngestScorer.age });
          }
          youngestScorer = { season: state.season, date: fixture.date, competition, playerId, name: player.name, clubId, opponentId, age: player.age };
        }
        const goals = history.current.goals[competition]?.[playerId] ?? 0;
        if (!mostSeasonGoals || goals > mostSeasonGoals.goals) {
          const isOthers = mostSeasonGoals && (mostSeasonGoals.playerId !== playerId || mostSeasonGoals.season !== state.season);
          if (mostSeasonGoals && isOthers && goals >= NOTABLE_LEAGUE_GOALS) {
            tell({ scope: "league", competition, kind: "mostSeasonGoals", clubId, playerId, name: player.name, value: goals, previous: mostSeasonGoals.goals });
          }
          const mark: GoalsMark = { season: state.season, playerId, name: player.name, clubId, goals };
          mostSeasonGoals = mark;
        }
      }
    }
    leagues[competition] = { biggestWin, youngestScorer, mostSeasonGoals };
  }
  return { state: { ...state, history: { ...history, clubs, leagues } }, events };
}
