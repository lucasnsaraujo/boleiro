import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { finishMatchDay } from "./finishMatchDay.js";
import type { LiveDay } from "./liveDay.js";
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

const coachFixtureId = (live: LiveDay) => live.coachMatch?.fixtureId ?? "";
const otherMatches = (live: LiveDay) => live.matches.filter((m) => m.fixtureId !== coachFixtureId(live));
const coachEvents = (live: LiveDay) => live.matches.find((m) => m.fixtureId === coachFixtureId(live))?.events ?? [];

describe("a live change", () => {
  const live = startMatchDay(matchDay, {});

  it("redraws only the coach's match, and only after the minute of the change", () => {
    const changed = applyLiveChange(live, 60, { posture: "attacking" });
    expect(otherMatches(changed)).toEqual(otherMatches(live));
    expect(coachEvents(changed).filter((e) => e.minute <= 60 && e.type !== "fullTime")).toEqual(
      coachEvents(live).filter((e) => e.minute <= 60 && e.type !== "fullTime"),
    );
    const others = (day: LiveDay) => finishMatchDay(day).state.fixtures.filter((f) => f.date === matchDay.date && f.id !== coachFixtureId(live));
    expect(others(changed)).toEqual(others(live));
  });

  it("gives the same match for the same seed and the same changes at the same minutes", () => {
    const play = () => finishMatchDay(applyLiveChange(applyLiveChange(live, 30, { formation: "4-3-3" }), 70, { posture: "defensive" }));
    expect(play()).toEqual(play());
  });
});

describe("substitutions", () => {
  const live = startMatchDay(matchDay, {});
  const coachSide = live.matches.find((m) => m.fixtureId === coachFixtureId(live))?.homeId === COACH_CLUB ? "home" : "away";
  const starters = live.coachMatch?.starters[coachSide].filter((p) => p.group !== "GK") ?? [];
  const bench = live.coachMatch?.bench.filter((p) => p.group !== "GK") ?? [];
  const sub = (i: number) => ({ offId: starters[i]?.id ?? "", onId: bench[i]?.id ?? "" });

  it("bring the substitute on for the rest of the match and count both players' minutes", () => {
    const changed = applyLiveChange(live, 60, { substitutions: [sub(0)] });
    expect(coachEvents(changed)).toContainEqual({ type: "substitution", minute: 60, clubId: COACH_CLUB, playerId: sub(0).onId, offId: sub(0).offId });
    const { state } = finishMatchDay(changed);
    const minutesPlayed = (id: string) => (state.players[id]?.condition.seasonMinutes ?? 0) - (matchDay.players[id]?.condition.seasonMinutes ?? 0);
    expect([minutesPlayed(sub(0).offId), minutesPlayed(sub(0).onId)]).toEqual([60, 30]);
  });

  it("stop at five", () => {
    const four = applyLiveChange(live, 45, { substitutions: [0, 1, 2, 3].map(sub) });
    expect(() => applyLiveChange(four, 60, { substitutions: [sub(4)] })).not.toThrow();
    expect(() => applyLiveChange(four, 60, { substitutions: [sub(4), sub(5)] })).toThrow(/at most 5 substitutions/);
  });

  it("come in at most three windows, plus half-time", () => {
    const threeWindows = [50, 60, 70].reduce((day, minute, i) => applyLiveChange(day, minute, { substitutions: [sub(i)] }), applyLiveChange(live, 45, { substitutions: [sub(5)] }));
    expect(() => applyLiveChange(threeWindows, 70, { substitutions: [sub(3)] })).not.toThrow();
    expect(() => applyLiveChange(threeWindows, 80, { substitutions: [sub(3)] })).toThrow(/at most 3 substitution windows/);
  });

  it("still come at half-time after three windows in the first half", () => {
    const threeWindows = [10, 20, 30].reduce((day, minute, i) => applyLiveChange(day, minute, { substitutions: [sub(i)] }), live);
    expect(() => applyLiveChange(threeWindows, 45, { substitutions: [sub(3)] })).not.toThrow();
  });

  it("take each player off only once", () => {
    expect(() => applyLiveChange(live, 60, { substitutions: [sub(0), { offId: sub(0).offId, onId: sub(1).onId }] })).toThrow(/is not on the pitch/);
  });

  it("never bring a player back once he is off", () => {
    const changed = applyLiveChange(live, 30, { substitutions: [sub(0)] });
    expect(() => applyLiveChange(changed, 60, { substitutions: [{ offId: sub(0).onId, onId: sub(0).offId }] })).toThrow(/cannot come on/);
    const subOff = applyLiveChange(changed, 60, { substitutions: [{ offId: sub(0).onId, onId: sub(1).onId }] });
    expect(() => applyLiveChange(subOff, 70, { substitutions: [{ offId: sub(1).onId, onId: sub(0).onId }] })).toThrow(/cannot come on/);
  });
});

describe("the coach's posture", () => {
  // Only the coach's match, so each seed plays one game.
  const coachOnly = { ...matchDay, fixtures: matchDay.fixtures.filter((f) => f.date !== matchDay.date || f.homeId === COACH_CLUB || f.awayId === COACH_CLUB) };
  const goalsWith = (posture: "attacking" | "defensive") => {
    const totals = { for: 0, against: 0 };
    for (let seed = 0; seed < 300; seed++) {
      const changed = applyLiveChange(startMatchDay({ ...coachOnly, rngState: seed }, {}), 0, { posture });
      for (const e of coachEvents(changed)) if (e.type === "goal") totals[e.clubId === COACH_CLUB ? "for" : "against"]++;
    }
    return totals;
  };

  it("makes an attacking side score and concede more than a defensive one for the rest of the match", () => {
    const attacking = goalsWith("attacking");
    const defensive = goalsWith("defensive");
    expect(attacking.for).toBeGreaterThan(1.2 * defensive.for);
    expect(attacking.against).toBeGreaterThan(1.2 * defensive.against);
  });
});
