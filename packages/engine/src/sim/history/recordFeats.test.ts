import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import type { MatchSheets } from "./recordMatches.js";
import { recordMatches } from "./recordMatches.js";
import { recordFeats, type RecordBroken } from "./recordFeats.js";

const start = loadNewGame(3, { coachClubId: "bahia-ba" });
const league = Object.values(start.competitions).find((c) => c.kind === "league" && c.division === "A");
if (!league) throw new Error("no Série A");
const [HOME = "", AWAY = ""] = league.clubIds.filter((id) => id !== "bahia-ba");
const squad = (clubId: string) => Object.values(start.players).filter((p) => p.clubId === clubId).slice(0, 11);
const [striker, other] = squad(HOME);
if (!striker || !other) throw new Error("no players");

type Game = { homeGoals: number; awayGoals: number; scorers?: string[]; homeId?: string; awayId?: string; players?: Record<string, SimPlayer> };

/** Plays `games` one a week from the game's first day, each recorded as finishMatchDay records it. */
function play(games: readonly Game[], from: GameState = start): { state: GameState; events: RecordBroken[] } {
  let state = from;
  const events: RecordBroken[] = [];
  games.forEach((game, i) => {
    const homeId = game.homeId ?? HOME;
    const awayId = game.awayId ?? AWAY;
    const fixture: Fixture = { id: `test-${i}`, competitionId: league?.id ?? "", stage: 0, date: addDays(from.date, 7 * i), homeId, awayId, result: { homeGoals: game.homeGoals, awayGoals: game.awayGoals } };
    const lineup = (clubId: string) => Object.values(game.players ?? state.players).filter((p) => p.clubId === clubId).slice(0, 11);
    const sheets: MatchSheets = { [fixture.id]: { home: lineup(homeId), away: lineup(awayId), scorers: { home: game.scorers ?? [], away: [] } } };
    const before = { ...state, date: fixture.date, fixtures: [...state.fixtures, fixture] };
    const feats = recordFeats(recordMatches(before, [fixture], sheets), before, [fixture], sheets);
    state = feats.state;
    events.push(...feats.events);
  });
  return { state, events };
}

const draw = { homeGoals: 1, awayGoals: 1 };
const loss = { homeGoals: 0, awayGoals: 1 };

describe("a club's records", () => {
  it("keep its longest unbeaten run, in every competition, until a defeat ends the run under way", () => {
    const { state } = play([draw, draw, draw, loss, draw]);
    const records = state.history.clubs[HOME];
    expect(records?.longestUnbeaten).toMatchObject({ games: 3, from: start.date, until: addDays(start.date, 14) });
    expect(records?.unbeaten).toMatchObject({ games: 1, from: addDays(start.date, 28) });
  });

  it("keep its youngest scorer and the most goals a player scored for it in the season", () => {
    const young = { ...striker, age: 17 };
    const players = { ...start.players, [striker.id]: young };
    const { state } = play([{ homeGoals: 2, awayGoals: 0, scorers: [striker.id, other.id] }, { homeGoals: 1, awayGoals: 0, scorers: [striker.id], players }], start);
    const records = state.history.clubs[HOME];
    expect(records?.youngestScorer).toMatchObject({ playerId: striker.id, age: 17, opponentId: AWAY });
    expect(records?.mostSeasonGoals).toMatchObject({ playerId: striker.id, goals: 2, season: start.season });
  });

  it("count only the goals a player scored for it, not those for the club he left this season", () => {
    const arrived = { ...striker, condition: { ...striker.condition, arrivedOn: start.date } };
    const goals = { "serie-a": { [striker.id]: 10 } };
    const from = { ...start, players: { ...start.players, [striker.id]: arrived }, history: { ...start.history, current: { ...start.history.current, goals } } };
    const { state } = play([{ homeGoals: 1, awayGoals: 0, scorers: [striker.id] }], from);
    expect(state.history.clubs[HOME]?.mostSeasonGoals).toMatchObject({ playerId: striker.id, goals: 1 });
  });
});

describe("a league's records", () => {
  it("keep its biggest win, its youngest scorer and the most goals in a season", () => {
    const { state } = play([{ homeGoals: 3, awayGoals: 0, scorers: [striker.id, striker.id, other.id] }, { homeGoals: 5, awayGoals: 1, homeId: AWAY, awayId: HOME }]);
    const records = state.history.leagues?.["serie-a"];
    expect(records?.biggestWin).toMatchObject({ homeId: AWAY, awayId: HOME, homeGoals: 5, awayGoals: 1 });
    expect(records?.mostSeasonGoals).toMatchObject({ playerId: striker.id, goals: 2 });
    expect(records?.youngestScorer?.age).toBe(Math.min(striker.age, other.age));
  });
});

describe("a record broken", () => {
  it("is news when a run passes an older notable one, and only once", () => {
    const longRun = Array.from({ length: 10 }, () => draw);
    const { events } = play([...longRun, loss, ...longRun, draw, draw]);
    const broken = events.filter((e) => e.kind === "longestUnbeaten" && e.clubId === HOME);
    expect(broken).toEqual([expect.objectContaining({ scope: "club", value: 11, previous: 10 })]);
  });

  it("is not news while the marks are small", () => {
    const { events } = play([draw, loss, draw, draw, loss, { homeGoals: 2, awayGoals: 0 }, { homeGoals: 3, awayGoals: 0 }]);
    expect(events).toEqual([]);
  });

  it("is news when a league's biggest win falls to a bigger one", () => {
    const { events } = play([{ homeGoals: 4, awayGoals: 0 }, { homeGoals: 5, awayGoals: 0 }]);
    expect(events.filter((e) => e.scope === "league")).toEqual([expect.objectContaining({ kind: "biggestWin", competition: "serie-a", clubId: HOME, value: 5, previous: 4 })]);
  });
});
