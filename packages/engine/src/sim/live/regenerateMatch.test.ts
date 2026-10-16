import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { onPitchAt } from "./aiSubstitutions.js";
import { regenerateMatch } from "./regenerateMatch.js";

const start = loadNewGame(5, { coachClubId: "flamengo-rj" });

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
