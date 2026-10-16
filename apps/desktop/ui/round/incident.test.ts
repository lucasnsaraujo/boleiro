import { expect, test } from "vitest";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { incidentAt, layoffText } from "./incident.js";
import { liveLimits } from "./lineupDraft.js";

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
  player("gk2", "GK", 64),
  player("d5", "DEF", 66),
  player("d6", "DEF", 70),
  player("m5", "MID", 71),
  player("a3", "ATT", 72),
];
const coach: CoachSide = {
  fixtureId: "f",
  side: "home",
  starters: squad.slice(0, 11).map((p) => p.id),
  benchIds: squad.slice(11).map((p) => p.id),
  squad,
  tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null },
  rivalFormation: "4-4-2",
  lastChangeMinute: 0,
  incidentHandling: "askCoach", shootout: { kickers: [], isOverruled: false },
};
const at = (events: MatchEvent[], minute: number) => incidentAt(coach, events, CLUB, liveLimits(coach, events, CLUB, minute));

test("nothing happened to the coach's side at the minute, so no window opens", () => {
  expect(at([{ type: "card", minute: 30, clubId: "vit", playerId: "v1", card: "red" }], 30)).toBeNull();
  expect(at([{ type: "card", minute: 30, clubId: CLUB, playerId: "m1", card: "yellow" }], 30)).toBeNull();
  expect(at([{ type: "injury", minute: 20, clubId: CLUB, playerId: "m1", days: 10 }], 30)).toBeNull();
});

test("a hurt player is swapped for the strongest of his position on the bench", () => {
  const incident = at([{ type: "injury", minute: 30, clubId: CLUB, playerId: "d2", days: 18 }], 30);
  expect(incident).toMatchObject({ minute: 30, sentOff: [], hurt: [{ playerId: "d2", days: 18 }] });
  expect(incident?.suggestions).toEqual([{ forId: "d2", offId: "d2", onId: "d6" }]);
});

test("a keeper sent off is replaced by the bench keeper, for the weakest forward", () => {
  const incident = at([{ type: "card", minute: 50, clubId: CLUB, playerId: "gk", card: "red" }], 50);
  expect(incident).toMatchObject({ sentOff: [{ playerId: "gk", card: "red" }], playersLeft: 10 });
  expect(incident?.suggestions).toEqual([{ forId: "gk", offId: "a2", onId: "gk2" }]);
});

test("a defender sent off is replaced by a bench defender for the weakest forward; a midfielder sent off asks for no change", () => {
  expect(at([{ type: "card", minute: 50, clubId: CLUB, playerId: "d1", card: "secondYellow" }], 50)?.suggestions).toEqual([{ forId: "d1", offId: "a2", onId: "d6" }]);
  expect(at([{ type: "card", minute: 50, clubId: CLUB, playerId: "m1", card: "red" }], 50)?.suggestions).toEqual([]);
});

test("the assistant suggests no more substitutions than the coach has left, the man sent off first", () => {
  const subs = (ons: string[]): MatchEvent[] =>
    ons.map((onId, i) => ({ type: "substitution", minute: i < 2 ? 10 : 20, clubId: CLUB, playerId: onId, offId: ["m2", "m3", "m4", "a1", "d3"][i] ?? "" }));
  const incidents: MatchEvent[] = [
    { type: "injury", minute: 60, clubId: CLUB, playerId: "d2", days: 5 },
    { type: "card", minute: 60, clubId: CLUB, playerId: "gk", card: "red" },
  ];
  expect(at([...subs(["m5", "a3", "d5", "d6"]), ...incidents], 60)?.suggestions).toEqual([{ forId: "gk", offId: "a2", onId: "gk2" }]);
  expect(at([...subs(["m5", "a3", "d5", "d6", "gk2"]), ...incidents], 60)?.suggestions).toEqual([]);
});

test("a layoff reads in days when short and in weeks when long", () => {
  expect(layoffText(4)).toBe("4 dias");
  expect(layoffText(1)).toBe("1 dia");
  expect(layoffText(14)).toBe("2 semanas");
  expect(layoffText(18)).toBe("2 a 3 semanas");
});

test("a side that lost a player hurt earlier and never replaced counts him out of those left", () => {
  const events: MatchEvent[] = [
    { type: "injury", minute: 20, clubId: CLUB, playerId: "m3", days: 9 },
    { type: "card", minute: 50, clubId: CLUB, playerId: "m1", card: "red" },
  ];
  expect(at(events, 50)?.playersLeft).toBe(9);
});
