import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { applyLiveChange } from "../live/applyLiveChange.js";
import { finishMatchDay } from "../live/finishMatchDay.js";
import type { LiveDay } from "../live/liveDay.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";

const COACH_CLUB = "flamengo-rj";
const CHANGE_MINUTE = 60;
const start = loadNewGame(5, { coachClubId: COACH_CLUB });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const isCall = (type: string) => type === "varCheck" || type === "wrongCall";
const coachEvents = (live: LiveDay) => live.matches.find((m) => m.fixtureId === live.coachMatch?.fixtureId)?.events ?? [];

/** The coach's first match day whose match has a call before the change minute. */
function dayWithCalls(): GameState {
  const dates = [...new Set(start.fixtures.filter((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB).map((f) => f.date))].sort();
  let state = start;
  for (const date of dates) {
    state = advanceTo(state, date);
    if (coachEvents(startMatchDay(state, {})).some((e) => isCall(e.type) && e.minute <= CHANGE_MINUTE)) return state;
  }
  throw new Error("no match of the coach has a call before the change");
}

const matchDay = dayWithCalls();

describe("the referee's calls in a live match day", () => {
  it("tells the day's matches with calls, and a coach's change keeps every call before its minute", () => {
    const live = startMatchDay(matchDay, {});
    expect(live.matches.some((m) => m.events.some((e) => isCall(e.type)))).toBe(true);
    const changed = applyLiveChange(live, CHANGE_MINUTE, { posture: "attacking" });
    const upTo = (events: ReturnType<typeof coachEvents>) => events.filter((e) => e.minute <= CHANGE_MINUTE && e.type !== "halfTime" && e.type !== "fullTime");
    expect(upTo(coachEvents(live)).some((e) => isCall(e.type))).toBe(true);
    expect(upTo(coachEvents(changed))).toEqual(upTo(coachEvents(live)));
  });

  it("plays on a day saved mid-match before referees, telling its calls again", () => {
    const live = startMatchDay(matchDay, {});
    const saved: LiveDay = { ...live, matches: live.matches.map((m) => ({ ...m, events: m.events.filter((e) => !isCall(e.type)) })) };
    const changed = applyLiveChange(saved, CHANGE_MINUTE, { posture: "attacking" });
    const calls = (l: LiveDay) => coachEvents(l).filter((e) => isCall(e.type) && e.minute <= CHANGE_MINUTE);
    expect(calls(changed)).toEqual(calls(live));
    expect(finishMatchDay(changed).state.date > matchDay.date).toBe(true);
  });

  it("puts the day's VAR changes and wrong calls in the day's events, each with its match's referee", () => {
    const live = startMatchDay(matchDay, {});
    const { events } = finishMatchDay(live);
    const told = events.filter((e) => e.type === "refereeCall");
    const talked = live.matches.flatMap((m) => m.events.filter((e) => e.type === "wrongCall" || (e.type === "varCheck" && e.decision !== "goalStands")));
    expect(told).toHaveLength(talked.length);
    expect(told.length).toBeGreaterThan(0);
  });
});
