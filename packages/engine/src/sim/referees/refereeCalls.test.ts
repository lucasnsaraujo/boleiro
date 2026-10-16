import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import { seededRandom } from "../../engine/random.js";
import type { SimPlayer } from "../gameState.js";
import type { MatchEvent } from "../live/matchTimeline.js";
import { freshCondition } from "../players/openingProfile.js";
import type { MatchOfficials } from "./matchOfficials.js";
import { withRefereeCalls, type RefereeCall } from "./refereeCalls.js";

const player = (id: string, clubId: string, group: PositionGroup): SimPlayer => ({
  id, name: id, group, strength: 70, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const eleven = (clubId: string) => [
  player(`${clubId}-gk`, clubId, "GK"),
  ...Array.from({ length: 10 }, (_, i) => player(`${clubId}-${i}`, clubId, i < 4 ? "DEF" : i < 8 ? "MID" : "ATT")),
];
const home = { clubId: "home", onPitch: () => eleven("home") };
const away = { clubId: "away", onPitch: () => eleven("away") };
const MATCHES = 4000;

/** A match's goals, penalties and straight reds at Série A's rates per match: 2.49, 0.28 and 0.18. */
function matchEvents(random: () => number): MatchEvent[] {
  const events: MatchEvent[] = [];
  const side = () => (random() < 0.5 ? "home" : "away");
  const minute = () => 1 + Math.floor(random() * 90);
  for (let i = 0; i < 6; i++) {
    if (random() < 2.49 / 6) {
      const clubId = side();
      events.push({ type: "goal", minute: minute(), clubId, playerId: `${clubId}-9`, kind: random() < 0.09 ? "penalty" : "openPlay" });
    }
  }
  if (random() < 0.05) events.push({ type: "penaltyMiss", minute: minute(), clubId: "home", playerId: "home-9", keeperId: "away-gk", isSaved: true });
  if (random() < 0.18) events.push({ type: "card", minute: minute(), clubId: "away", playerId: "away-2", card: "red" });
  return events;
}

const VAR: MatchOfficials = { referee: null, strictness: 1, var: "brazil" };
const NO_VAR: MatchOfficials = { referee: null, strictness: 1, var: null };

function season(officials: MatchOfficials, seed = 1): { events: MatchEvent[]; calls: RefereeCall[] }[] {
  const random = seededRandom(99);
  return Array.from({ length: MATCHES }, (_, i) => {
    const played = matchEvents(random);
    const events = withRefereeCalls(played, { seed, fixtureId: `f${i}`, officials, home, away });
    return { events, calls: events.filter((e): e is RefereeCall => e.type === "varCheck" || e.type === "wrongCall") };
  });
}

const perMatch = (matches: ReturnType<typeof season>, isCounted: (c: RefereeCall) => boolean) => matches.reduce((sum, m) => sum + m.calls.filter(isCounted).length, 0) / matches.length;
const isChange = (c: RefereeCall) => c.type === "varCheck" && c.decision !== "goalStands";

describe("the referee's calls", () => {
  it("has VAR change about half a decision a match where it watches, as in the 2025 Série A (0.505), and few wrong calls stand", () => {
    const matches = season(VAR);
    expect(perMatch(matches, isChange)).toBeGreaterThan(0.42);
    expect(perMatch(matches, isChange)).toBeLessThan(0.6);
    expect(perMatch(matches, (c) => c.type === "wrongCall")).toBeGreaterThan(0.05);
    expect(perMatch(matches, (c) => c.type === "wrongCall")).toBeLessThan(0.13);
  });

  it("logs goals ruled out by VAR at FotMob's rate, the bulk of the 0.20 overturns a match it records", () => {
    const ruledOut = perMatch(season(VAR), (c) => c.type === "varCheck" && c.decision === "goalRuledOut");
    expect(ruledOut).toBeGreaterThan(0.11);
    expect(ruledOut).toBeLessThan(0.17);
  });

  it("lets every error stand where no VAR watches: about 0.59 wrong calls a match and no check", () => {
    const matches = season(NO_VAR);
    expect(perMatch(matches, (c) => c.type === "varCheck")).toBe(0);
    expect(perMatch(matches, (c) => c.type === "wrongCall")).toBeGreaterThan(0.5);
    expect(perMatch(matches, (c) => c.type === "wrongCall")).toBeLessThan(0.68);
  });

  it("has Europe's VAR step in about half as often as Brazil's, and stop the match for less time", () => {
    const europe = season({ ...VAR, var: "europe" });
    const brazil = season(VAR);
    expect(perMatch(europe, isChange)).toBeLessThan(0.6 * perMatch(brazil, isChange));
    const seconds = (matches: typeof europe) => matches.flatMap((m) => m.calls).find((c) => c.type === "varCheck" && c.decision === "goalRuledOut");
    expect(seconds(europe)).toMatchObject({ seconds: 48 });
    expect(seconds(brazil)).toMatchObject({ seconds: 100 });
  });

  it("never changes the score, cards or players: the timeline without its calls is the one played", () => {
    const random = seededRandom(5);
    for (let i = 0; i < 500; i++) {
      const played = matchEvents(random);
      const told = withRefereeCalls(played, { seed: 3, fixtureId: `f${i}`, officials: i % 2 ? VAR : NO_VAR, home, away });
      expect(told.filter((e) => e.type !== "varCheck" && e.type !== "wrongCall")).toEqual(played.toSorted((a, b) => a.minute - b.minute));
    }
  });

  it("names players on the pitch, of the side the call is about, and makes wrong calls cost the side named", () => {
    for (const { calls } of season(NO_VAR).slice(0, 500)) {
      for (const call of calls) {
        expect(call.playerId.startsWith(`${call.clubId}-`)).toBe(true);
        if (call.type === "wrongCall" && call.call === "goalWronglyRuledOut") expect(call.againstId).toBe(call.clubId);
        if (call.type === "wrongCall" && call.call === "goalShouldNotStand") expect(call.againstId).not.toBe(call.clubId);
      }
    }
  });

  it("tells the same calls for the same seed, other calls for another", () => {
    const calls = (seed: number) => season(VAR, seed).slice(0, 300).map((m) => m.calls);
    expect(calls(1)).toEqual(calls(1));
    expect(calls(2)).not.toEqual(calls(1));
  });

  it("keeps every call before a minute when the rest of the match is drawn again", () => {
    const random = seededRandom(8);
    for (let i = 0; i < 300; i++) {
      const played = matchEvents(random);
      const redrawn = [...played.filter((e) => e.minute <= 60), ...matchEvents(random).filter((e) => e.minute > 60)];
      const match = { seed: 4, fixtureId: `f${i}`, officials: VAR, home, away };
      const before = (events: readonly MatchEvent[]) => events.filter((e) => e.minute <= 60);
      expect(before(withRefereeCalls(redrawn, match))).toEqual(before(withRefereeCalls(played, match)));
    }
  });

  it("drops the calls a timeline already has and tells them again", () => {
    const played = matchEvents(seededRandom(12));
    const match = { seed: 4, fixtureId: "f", officials: VAR, home, away };
    const once = withRefereeCalls(played, match);
    expect(withRefereeCalls(once, match)).toEqual(once);
  });
});
