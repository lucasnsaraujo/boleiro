import { expect, test } from "vitest";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { asksShootoutOrder, nextSavedTactics, planKeyOf, shootoutKickersOf } from "./livePlan.js";

const CLUB = "bahia";
const player = (id: string, group: PositionGroup, strength: number): SquadPlayer => ({ id, name: id.toUpperCase(), group, strength, fatigue: 0, status: null });
const squad = [
  player("gk", "GK", 70),
  player("d1", "DEF", 72),
  player("d2", "DEF", 71),
  player("d3", "DEF", 69),
  player("d4", "DEF", 68),
  player("m1", "MID", 74),
  player("m2", "MID", 73),
  player("m3", "MID", 70),
  player("m4", "MID", 69),
  player("a1", "ATT", 76),
  player("a2", "ATT", 65),
  player("a3", "ATT", 80),
];
const tactics: Tactics = { formation: "4-4-2", posture: "balanced", penaltyTakerId: null };
const side: CoachSide = {
  fixtureId: "f",
  side: "home",
  starters: squad.slice(0, 11).map((p) => p.id),
  benchIds: ["a3"],
  squad,
  tactics,
  rivalFormation: "4-4-2",
  lastChangeMinute: 0,
  incidentHandling: "askCoach",
  shootout: { kickers: [], isOverruled: false },
  opponent: { clubId: "rival", name: "Rival", starters: [], bench: [], formation: "4-4-2", rivalTactics: null, form: [] },
  halfTimeTalk: { moment: { lead: 0, morale: 50, isDerby: false }, suggested: "calm", given: null },
};
const attacking: Tactics = { formation: "4-3-3", posture: "attacking", penaltyTakerId: null };
const parking: Tactics = { formation: "5-4-1", posture: "defensive", penaltyTakerId: null, marking: "veryHeavy" };

test("the tactics key moves a side through its saved tactics in turn, from the first when it plays none of them", () => {
  const plan = { savedTactics: [attacking, parking], asksBeforeShootout: false };
  expect(nextSavedTactics({ plan, tactics })).toBe(0);
  expect(nextSavedTactics({ plan, tactics: attacking })).toBe(1);
  expect(nextSavedTactics({ plan, tactics: { ...parking, penaltyTakerId: "a1" } })).toBe(0);
  expect(nextSavedTactics({ plan: { savedTactics: [], asksBeforeShootout: false }, tactics })).toBeNull();
  expect(nextSavedTactics({ tactics })).toBeNull();
});

test("a key belongs to the one hot-seat coach whose plan took it, for his tactics or his time-out, in any case", () => {
  const ana = { clubId: "fla", side: { plan: { tacticsKey: "q", timeOutKey: "w", savedTactics: [], asksBeforeShootout: false } } };
  const bruno = { clubId: "pal", side: { plan: { tacticsKey: "o", timeOutKey: "p", savedTactics: [], asksBeforeShootout: false } } };
  expect(planKeyOf([ana, bruno], "W")).toEqual({ coached: ana, command: "timeOut" });
  expect(planKeyOf([ana, bruno], "o")).toEqual({ coached: bruno, command: "tactics" });
  expect(planKeyOf([ana, bruno], "x")).toBeNull();
});

const level: MatchEvent[] = [
  { type: "substitution", minute: 60, clubId: CLUB, playerId: "a3", offId: "a2" },
  { type: "card", minute: 70, clubId: CLUB, playerId: "m4", card: "red" },
  { type: "halfTime", minute: 45 },
  { type: "fullTime", minute: 90 },
  { type: "shootoutKick", minute: 90, clubId: CLUB, playerId: "a1", isScored: true },
];

test("the round asks a coach his shootout order only when his plan asks for it, his match ends level at that minute, and the house rule leaves it to him", () => {
  const asking = { ...side, plan: { savedTactics: [], asksBeforeShootout: true } };
  expect(asksShootoutOrder(asking, level, CLUB, 90)).toBe(true);
  expect(asksShootoutOrder(asking, level, CLUB, 89)).toBe(false);
  expect(asksShootoutOrder(side, level, CLUB, 90)).toBe(false);
  expect(asksShootoutOrder({ ...asking, incidentHandling: "matchPlan" }, level, CLUB, 90)).toBe(false);
  expect(asksShootoutOrder(asking, level.slice(0, 4), CLUB, 90)).toBe(false);
});

test("the kickers are those who finished on the pitch, the coach's order first, then the strongest", () => {
  const ordered = { ...side, tactics: { ...tactics, kickerOrder: ["d4", "a2", "m4", "gk"] } };
  const kickers = shootoutKickersOf(ordered, level, CLUB);
  expect(kickers.slice(0, 2)).toEqual(["d4", "gk"]);
  expect(kickers).not.toContain("a2");
  expect(kickers).not.toContain("m4");
  expect(kickers[2]).toBe("a3");
  expect(kickers).toHaveLength(10);
});
