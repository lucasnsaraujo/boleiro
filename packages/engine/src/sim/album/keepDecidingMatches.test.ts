import { describe, expect, it } from "vitest";
import type { Fixture, GameState } from "../gameState.js";
import { recordMatches, type MatchSheets } from "../history/recordMatches.js";
import type { LiveMatch } from "../live/liveDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { keepDecidingMatches } from "./keepDecidingMatches.js";

const COACH = "bahia-ba";
const RIVAL = "vitoria-ba";

/**
 * Série A with every match drawn 0–0 but two: the rival won one 1–0 before the last round, and the
 * coach's club wins 2–0 on the last day. Both end on 40 points, the coach's club ahead on goal difference.
 */
function lastRound(): { state: GameState; played: Fixture[] } {
  const game = loadNewGame(3, { coachClubId: COACH });
  const league = Object.values(game.competitions).find((c) => c.kind === "league" && c.division === "A");
  if (!league) throw new Error("the game has a Série A");
  const own = game.fixtures.filter((f) => f.competitionId === league.id);
  const lastDate = own.map((f) => f.date).sort().at(-1) ?? "";
  const coachLast = own.find((f) => f.date === lastDate && (f.homeId === COACH || f.awayId === COACH));
  const rivalWin = own.find((f) => f.date < lastDate && (f.homeId === RIVAL || f.awayId === RIVAL) && f.homeId !== COACH && f.awayId !== COACH);
  if (!coachLast || !rivalWin) throw new Error("the season has the two matches");
  const scored = (f: Fixture, clubId: string, goals: number) => (f.homeId === clubId ? { homeGoals: goals, awayGoals: 0 } : { homeGoals: 0, awayGoals: goals });
  const fixtures = game.fixtures.map((f): Fixture => {
    if (f.competitionId !== league.id) return f;
    if (f.id === coachLast.id) return { ...f, result: scored(f, COACH, 2) };
    if (f.id === rivalWin.id) return { ...f, result: scored(f, RIVAL, 1) };
    return { ...f, result: { homeGoals: 0, awayGoals: 0 } };
  });
  return { state: { ...game, fixtures }, played: fixtures.filter((f) => f.date === lastDate && f.competitionId === league.id) };
}

describe("a league won on the last day", () => {
  it("keeps the last match of a title won on goal difference, level on points", () => {
    const { state, played } = lastRound();
    const squad = (clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId).slice(0, 11);
    const sheets: MatchSheets = Object.fromEntries(played.map((f) => [f.id, { home: squad(f.homeId), away: squad(f.awayId), scorers: { home: [], away: [] } }]));
    const matches: LiveMatch[] = played.map((f) => ({ fixtureId: f.id, homeId: f.homeId, awayId: f.awayId, formations: { home: "4-4-2", away: "4-4-2" }, events: [] }));
    const kept = keepDecidingMatches(recordMatches(state, played, sheets), played, sheets, matches).history.coach.keptMatches ?? [];
    expect(kept.map((m) => [m.kind, m.isWon, m.fixture.homeId === COACH || m.fixture.awayId === COACH])).toEqual([["league", true, true]]);
  });
});
