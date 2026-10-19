import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { onPitchAt } from "./aiSubstitutions.js";
import { regenerateMatch } from "./regenerateMatch.js";

const start = loadNewGame(2, { coachClubId: "flamengo-rj" });

function firstPlayedDay(state: GameState): GameState {
  let current = state;
  while (!current.fixtures.some((f) => f.result && f.competitionId.startsWith("serie-a"))) current = advanceDay(current, {}).state;
  return current;
}

const played = firstPlayedDay(start);
const fixtures = played.fixtures.filter((f): f is Fixture & { result: NonNullable<Fixture["result"]> } => f.result !== null);
const count = (events: readonly { type: string; clubId?: string }[], type: string, clubId: string) => events.filter((e) => e.type === type && e.clubId === clubId).length;

describe("a played match told again from its fixture's seed", () => {
  it("ends on the match's real score and books each side's real number of cards, between both whistles", () => {
    for (const fixture of fixtures) {
      const { events } = regenerateMatch(played, fixture);
      const { result } = fixture;
      expect([count(events, "goal", fixture.homeId), count(events, "goal", fixture.awayId)]).toEqual([result.homeGoals, result.awayGoals]);
      const cards = (side: "home" | "away") => (result.cards?.[side].yellows ?? 0) + (result.cards?.[side].reds ?? 0);
      expect([count(events, "card", fixture.homeId), count(events, "card", fixture.awayId)]).toEqual([cards("home"), cards("away")]);
      expect(events.filter((e) => e.type === "fullTime")).toHaveLength(1);
    }
  });

  it("tells a match won in extra time with its ninety minutes level and the winner's extra goals in extra time", () => {
    const [first] = fixtures;
    if (!first) return expect.fail("the day played a match");
    const wonLate = { ...first, result: { homeGoals: 3, awayGoals: 1, isAfterExtraTime: true as const } };
    const { events } = regenerateMatch(played, wonLate);
    const goals = (clubId: string, from: number, to: number) => events.filter((e) => e.type === "goal" && e.clubId === clubId && e.minute > from && e.minute <= to).length;
    expect([goals(first.homeId, 0, 90), goals(first.awayId, 0, 90)]).toEqual([1, 1]);
    expect([goals(first.homeId, 90, 120), goals(first.awayId, 90, 120)]).toEqual([2, 0]);
    expect(events.filter((e) => e.type === "extraTimeEnd")).toHaveLength(1);
    const shootout = regenerateMatch(played, { ...first, result: { homeGoals: 2, awayGoals: 2, isAfterExtraTime: true as const, penaltyWinnerId: first.awayId } }).events;
    const shootoutGoals = (clubId: string, from: number, to: number) => shootout.filter((e) => e.type === "goal" && e.clubId === clubId && e.minute > from && e.minute <= to).length;
    expect([shootoutGoals(first.homeId, 0, 90), shootoutGoals(first.awayId, 0, 90), shootoutGoals(first.homeId, 90, 120) + shootoutGoals(first.awayId, 90, 120)]).toEqual([2, 2, 0]);
    expect(shootout.filter((e) => e.type === "extraTimeEnd")).toHaveLength(1);
  });

  it("tells a second leg won in extra time with its ninety minutes leaving the tie level on aggregate", () => {
    const [first] = fixtures;
    if (!first) return expect.fail("the day played a match");
    const secondLeg = { ...first, tie: 0, result: { homeGoals: 2, awayGoals: 3, isAfterExtraTime: true as const } };
    const firstLeg: Fixture = { ...first, id: `${first.id}-first-leg`, date: "2026-01-02", homeId: first.awayId, awayId: first.homeId, tie: 0, result: { homeGoals: 1, awayGoals: 0 } };
    const { events } = regenerateMatch({ ...played, fixtures: [firstLeg, ...played.fixtures] }, secondLeg);
    const goals = (clubId: string, from: number, to: number) => events.filter((e) => e.type === "goal" && e.clubId === clubId && e.minute > from && e.minute <= to).length;
    expect([goals(first.homeId, 0, 90), goals(first.awayId, 0, 90)]).toEqual([2, 1]);
    expect([goals(first.homeId, 90, 120), goals(first.awayId, 90, 120)]).toEqual([0, 2]);
  });

  it("tells the same story each time it is asked, and another one for another match", () => {
    const [first, second] = fixtures;
    if (!first || !second) return expect.fail("the day played two matches");
    expect(regenerateMatch(played, first)).toEqual(regenerateMatch(played, first));
    expect(regenerateMatch(played, first).events).not.toEqual(regenerateMatch(played, { ...second, homeId: first.homeId, awayId: first.awayId }).events);
  });

  it("takes off a substitute in the change it sent him on in only when every starter on the pitch still has a part to play later", () => {
    for (const fixture of fixtures) {
      const story = regenerateMatch(played, fixture);
      const { events } = story;
      const subs = events.flatMap((e) => (e.type === "substitution" ? [e] : []));
      const cameOnAt = new Map(subs.map((e) => [e.playerId, e.minute]));
      const actsAfter = (playerId: string, minute: number) =>
        events.some((e) => e.minute > minute && "playerId" in e && (e.playerId === playerId || (e.type === "goal" && e.assistId === playerId)));
      for (const sub of subs.filter((e) => cameOnAt.get(e.offId) === e.minute)) {
        const side = sub.clubId === fixture.homeId ? "home" : "away";
        const free = onPitchAt(story.starters[side], story.benches[side], events, sub.clubId, sub.minute).filter(
          (p) => p.group !== "GK" && !cameOnAt.has(p.id) && !actsAfter(p.id, sub.minute),
        );
        expect(free.map((p) => p.id)).toEqual([]);
      }
    }
  });

  it("credits each goal to a player on the pitch for the scoring side as its minute begins, and lines up eleven a side", () => {
    for (const fixture of fixtures) {
      const story = regenerateMatch(played, fixture);
      expect(story.starters.home).toHaveLength(11);
      expect(story.starters.away).toHaveLength(11);
      for (const goal of story.events) {
        if (goal.type !== "goal" || goal.kind === "ownGoal") continue;
        const side = goal.clubId === fixture.homeId ? "home" : "away";
        const onPitch = onPitchAt(story.starters[side], story.benches[side], story.events, goal.clubId, goal.minute - 0.5);
        expect(onPitch.map((p) => p.id)).toContain(goal.playerId);
      }
    }
  });
});
