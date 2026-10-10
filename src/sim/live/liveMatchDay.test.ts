import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { finishMatchDay } from "./finishMatchDay.js";
import { FULL_TIME, HALF_TIME } from "./matchTimeline.js";
import { startMatchDay } from "./startMatchDay.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH_CLUB });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const coachMatchDate = start.fixtures.find((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB)?.date ?? "";
const matchDay = advanceTo(start, coachMatchDate);

describe("a live match day", () => {
  it("ends, with no live changes, exactly as advanceDay plays the day", () => {
    const decisions = { tactics: { formation: "4-3-3", posture: "attacking", penaltyTakerId: null } } as const;
    expect(finishMatchDay(startMatchDay(matchDay, decisions))).toEqual(advanceDay(matchDay, decisions));
  });

  it("gives every match of the day a timeline of its final score, its cards and both whistles", () => {
    const live = startMatchDay(matchDay, {});
    const { state } = finishMatchDay(live);
    const today = state.fixtures.filter((f) => f.date === matchDay.date);
    expect(live.matches.map((m) => m.fixtureId)).toEqual(today.map((f) => f.id));
    for (const match of live.matches) {
      const result = today.find((f) => f.id === match.fixtureId)?.result;
      const count = (type: string, clubId: string) => match.events.filter((e) => e.type === type && "clubId" in e && e.clubId === clubId).length;
      expect([count("goal", match.homeId), count("goal", match.awayId)]).toEqual([result?.homeGoals, result?.awayGoals]);
      const cards = (result?.cards?.home.yellows ?? 0) + (result?.cards?.home.reds ?? 0);
      expect(count("card", match.homeId)).toBe(cards);
      expect(match.events.filter((e) => e.type === "halfTime" || e.type === "fullTime")).toEqual([
        { type: "halfTime", minute: HALF_TIME },
        { type: "fullTime", minute: FULL_TIME },
      ]);
      expect(match.events.map((e) => e.minute)).toEqual(match.events.map((e) => e.minute).sort((a, b) => a - b));
    }
  });

  it("spreads goals over the minutes as Série A does, with more late goals than early ones", () => {
    const goalMinutes = Array.from({ length: 30 }, (_, seed) => seed).flatMap((seed) =>
      startMatchDay({ ...matchDay, rngState: seed }, {}).matches.flatMap((m) => m.events.filter((e) => e.type === "goal").map((e) => e.minute)),
    );
    const between = (from: number, to: number) => goalMinutes.filter((minute) => minute >= from && minute <= to).length;
    expect(goalMinutes.length).toBeGreaterThan(600);
    expect(between(76, 90)).toBeGreaterThan(1.4 * between(1, 15));
  });

  it("puts every injury of the day on the timeline of the injured player's match", () => {
    const live = startMatchDay(matchDay, {});
    const injured = finishMatchDay(live).events.flatMap((e) => (e.type === "playerInjured" ? [e.playerId] : []));
    const onTimeline = live.matches.flatMap((m) => m.events.flatMap((e) => (e.type === "injury" ? [e.playerId] : [])));
    expect(onTimeline.sort()).toEqual(injured.sort());
  });

  it("keeps the coach's tactics for his next matches", () => {
    const tactics = { formation: "5-3-2", posture: "defensive", penaltyTakerId: null } as const;
    const { state } = advanceDay(matchDay, { tactics });
    expect(state.coach.tactics).toEqual(tactics);
    expect(advanceDay(state, {}).state.coach.tactics).toEqual(tactics);
  });
});
