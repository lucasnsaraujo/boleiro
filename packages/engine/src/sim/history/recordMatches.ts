import { attendance } from "../finances/recordMatchFinances.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { championOf } from "./championOf.js";
import { competitionKey, type CompetitionKey, type PlayerAtClub } from "./history.js";
import { updateClubRecords } from "./updateClubRecords.js";

type Sides<T> = { home: T; away: T };

/** Who played each fixture today and who scored its goals (one id per goal), by fixture id. */
export type MatchSheets = Record<string, Sides<readonly SimPlayer[]> & { scorers: Sides<readonly string[]> }>;

/**
 * Writes today's matches into the history: appearances and goals per club, each club's match and
 * crowd records, and the champion of any competition that finished today. Run it before the gate is
 * booked, so the crowd is the one that came to the game.
 */
export function recordMatches(state: GameState, played: readonly Fixture[], sheets: MatchSheets): GameState {
  if (!played.length) return state;
  const { history } = state;
  const clubs = { ...history.clubs };
  const players = { ...history.players };
  const goals = { ...history.current.goals };
  const ownPlayers = new Map<string, Record<string, PlayerAtClub>>();
  const ownGoals = new Map<CompetitionKey, Record<string, number>>();
  const playersAt = (clubId: string) => {
    let own = ownPlayers.get(clubId);
    if (!own) ownPlayers.set(clubId, (own = players[clubId] = { ...players[clubId] }));
    return own;
  };
  const goalsIn = (key: CompetitionKey) => {
    let own = ownGoals.get(key);
    if (!own) ownGoals.set(key, (own = goals[key] = { ...goals[key] }));
    return own;
  };

  for (const fixture of played) {
    const sheet = sheets[fixture.id];
    if (!fixture.result || !sheet) continue;
    const competition = competitionKey(fixture.competitionId);
    const { homeGoals, awayGoals } = fixture.result;
    const sides = [
      { clubId: fixture.homeId, opponentId: fixture.awayId, home: true, lineup: sheet.home, scorers: sheet.scorers.home, goalsFor: homeGoals, goalsAgainst: awayGoals },
      { clubId: fixture.awayId, opponentId: fixture.homeId, home: false, lineup: sheet.away, scorers: sheet.scorers.away, goalsFor: awayGoals, goalsAgainst: homeGoals },
    ];
    for (const { clubId, opponentId, home, lineup: eleven, scorers, goalsFor, goalsAgainst } of sides) {
      const atClub = playersAt(clubId);
      for (const player of eleven) {
        const before = atClub[player.id];
        atClub[player.id] = { name: player.name, apps: (before?.apps ?? 0) + 1, goals: before?.goals ?? 0 };
      }
      const scored = goalsIn(competition);
      for (const id of scorers) {
        const scorer = atClub[id];
        if (scorer) atClub[id] = { ...scorer, goals: scorer.goals + 1 };
        scored[id] = (scored[id] ?? 0) + 1;
      }
      const mark = { season: state.season, date: fixture.date, competition, opponentId, home, goalsFor, goalsAgainst };
      const finance = state.finances[clubId];
      const crowd = home && finance ? attendance(state, finance, clubId, opponentId, fixture) : 0;
      clubs[clubId] = updateClubRecords(clubs[clubId], mark, crowd > 0 ? { season: state.season, date: fixture.date, competition, opponentId, crowd } : null);
    }
  }

  const champions = { ...history.current.champions };
  const trophies = [...history.coach.trophies];
  const finishing = new Set(played.filter((f) => f.stage === (state.competitions[f.competitionId]?.stageDates.length ?? 0) - 1).map((f) => f.competitionId));
  for (const id of finishing) {
    const competition = state.competitions[id];
    const key = competitionKey(id);
    if (!competition || key in champions) continue;
    const championId = championOf(competition, state.fixtures.filter((f) => f.competitionId === id));
    if (!championId) continue;
    champions[key] = championId;
    if (championId === state.coachClubId) trophies.push({ season: state.season, competition: key, clubId: championId });
  }

  return {
    ...state,
    history: {
      ...history,
      clubs,
      players,
      current: { ...history.current, champions, goals },
      coach: { ...history.coach, trophies },
    },
  };
}
