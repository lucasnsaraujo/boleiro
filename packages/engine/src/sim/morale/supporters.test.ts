import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { clubMood, NEUTRAL_MOOD, type ClubMood } from "./clubMood.js";

const start = loadNewGame(7, { coachClubId: null });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const leagueDay = advanceTo(start, start.calendar.leagueDates.A[2] ?? "");
const todays = (state: GameState): Fixture[] => state.fixtures.filter((f) => f.date === state.date && !f.result);
const game = todays(leagueDay).find((f) => leagueDay.clubs[f.homeId]?.division === "A");
if (!game) throw new Error("no Série A game on the test day");
const host = game.homeId;
const visitor = game.awayId;

function withMood(state: GameState, clubId: string, mood: Partial<ClubMood>): GameState {
  return { ...state, mood: { ...state.mood, [clubId]: { ...clubMood(state, clubId), ...mood } } };
}

function withStrength(state: GameState, clubId: string, strength: number): GameState {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, p.clubId === clubId ? { ...p, strength } : p]),
  );
  return { ...state, players };
}

/**
 * The test day with the host all but certain to lose at home. The day's other games are left out, so
 * its rivals' results (which move fan mood too) cannot push the host across a threshold either way.
 */
const onlyHostGame = (state: GameState): GameState => ({
  ...state,
  fixtures: state.fixtures.filter((f) => f.date !== state.date || f.result || f.id === game.id),
});
const weakHost = withStrength(onlyHostGame(leagueDay), host, 1);
const hostLosesWith = (rngState: number) => {
  const result = advanceDay({ ...weakHost, rngState }, {}).state.fixtures.find((f) => f.id === game.id)?.result;
  return (result?.homeGoals ?? 0) < (result?.awayGoals ?? 0);
};
// Even a side of 1s draws now and then, so the default draw is the first one where the host loses.
const losingDraw = [leagueDay.rngState, ...Array.from({ length: 20 }, (_, seed) => seed)].find(hostLosesWith) ?? leagueDay.rngState;
// The host starts from a neutral mood, so January's sales (which upset fans) don't decide the test.
const losing = (mood: Partial<ClubMood>, rngState = losingDraw) =>
  withMood({ ...weakHost, rngState }, host, { ...NEUTRAL_MOOD, ...mood });

const ofType = <T extends DayEvent["type"]>(events: DayEvent[], type: T) =>
  events.filter((e): e is Extract<DayEvent, { type: T }> => e.type === type);

describe("organised supporters", () => {
  it("start every club calm, with neutral morale and fan mood", () => {
    expect(clubMood(start, "flamengo-rj")).toEqual({ squad: 50, fans: 50, supporters: "calm", closedDoorGames: 0 });
    expect(Object.keys(start.mood).length).toBe(Object.keys(start.clubs).length);
  });

  it("put the club under pressure when a defeat drops fan mood low", () => {
    const { state, events } = advanceDay(losing({ fans: 36 }), {});
    expect(ofType(events, "fansPressure").filter((e) => e.clubId === host)).toEqual([{ type: "fansPressure", clubId: host, fans: clubMood(state, host).fans }]);
    expect(clubMood(state, host).supporters).toBe("pressure");
  });

  it("protest at the training ground when pressure goes on, which costs squad morale", () => {
    const before = losing({ fans: 26, supporters: "pressure", squad: 50 });
    const { state, events } = advanceDay(before, {});
    const calmLoss = advanceDay(losing({ fans: 60 }), {}).state;
    expect(ofType(events, "fansProtest").map((e) => e.clubId)).toContain(host);
    expect(clubMood(state, host).supporters).toBe("protest");
    expect(clubMood(state, host).squad).toBeLessThan(clubMood(calmLoss, host).squad - 5);
  });

  const violentDays = Array.from({ length: 160 }, (_, seed) => {
    const before = losing({ fans: 10, supporters: "protest" }, seed);
    return { before, ...advanceDay(before, {}) };
  });

  it("sometimes turn violent after a defeat when protests go on, and the club is fined", () => {
    const fined = violentDays.filter(({ events }) => ofType(events, "fansViolence").some((e) => e.fine > 0));
    expect(fined.length).toBeGreaterThan(0);
    expect(fined.length).toBeLessThan(violentDays.length / 2);
    for (const { before, state, events } of fined) {
      const [violence] = ofType(events, "fansViolence");
      expect(violence?.fine).toBeLessThanOrEqual(100_000);
      expect(state.finances[host]?.month.costs.fines).toBe(violence?.fine);
      expect(clubMood(state, host).supporters).toBe("violence");
      expect(clubMood(before, host).closedDoorGames).toBe(clubMood(state, host).closedDoorGames);
    }
  });

  it("sometimes get the club's next home games played behind closed doors instead of a fine", () => {
    const closed = violentDays.flatMap(({ state, events }) => ofType(events, "closedDoors").map((e) => ({ state, e })));
    expect(closed.length).toBeGreaterThan(0);
    for (const { state, e } of closed) {
      expect(e.games).toBeGreaterThanOrEqual(1);
      expect(e.games).toBeLessThanOrEqual(10);
      expect(clubMood(state, host)).toMatchObject({ closedDoorGames: e.games, supporters: "violence" });
      expect(state.finances[host]?.month.costs.fines).toBe(0);
    }
  });

  it("calm down once results bring fan mood back up", () => {
    const winning = withMood(withStrength(leagueDay, visitor, 1), host, { fans: 47, supporters: "protest" });
    expect(clubMood(advanceDay(winning, {}).state, host).supporters).toBe("calm");
  });
});

describe("closed doors", () => {
  const before = withMood(leagueDay, host, { closedDoorGames: 2 });
  const { state } = advanceDay(before, {});

  it("earn no ticket money from a home game and count the game served", () => {
    const open = advanceDay(leagueDay, {}).state;
    expect(open.finances[host]?.month.revenue.tickets).toBeGreaterThan(before.finances[host]?.month.revenue.tickets ?? 0);
    expect(state.finances[host]?.month.revenue.tickets).toBe(before.finances[host]?.month.revenue.tickets);
    expect(clubMood(state, host).closedDoorGames).toBe(1);
  });

  it("take away part of the home side's edge", () => {
    const goalDifference = (day: GameState) =>
      Array.from({ length: 60 }, (_, seed) => {
        const result = advanceDay({ ...day, rngState: seed }, {}).state.fixtures.find((f) => f.id === game.id)?.result;
        return (result?.homeGoals ?? 0) - (result?.awayGoals ?? 0);
      }).reduce((sum, d) => sum + d, 0);
    expect(goalDifference(before)).toBeLessThan(goalDifference(leagueDay));
  });
});

describe("mood in a save", () => {
  it("survives a save and load", () => {
    const angry = withMood(leagueDay, host, { fans: 12, squad: 30, supporters: "protest", closedDoorGames: 3 });
    expect(loadGame(saveGame(angry)).mood).toStrictEqual(angry.mood);
  });
});
