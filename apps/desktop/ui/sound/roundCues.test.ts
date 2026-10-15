import { expect, test } from "vitest";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { crowdLevel, roundCues, thinCues } from "./roundCues.js";

const colours = { primary: "#000000", secondary: "#ffffff" };
const club = (id: string) => ({ id, shortName: id, colours, stadium: `Estádio ${id}` });
const whistles: MatchEvent[] = [
  { type: "halfTime", minute: 45 },
  { type: "fullTime", minute: 90 },
];

function roundWith(ours: MatchEvent[], other: MatchEvent[] = [], hasCoach = true): LiveRound {
  return {
    date: "2026-04-01",
    coachClubId: hasCoach ? "bahia" : null,
    competitions: [{ id: "a", label: "Série A · 1ª rodada" }],
    matches: [
      { fixtureId: "other", competitionId: "a", homeId: "fla", awayId: "rem", events: [...other, ...whistles] },
      { fixtureId: "ours", competitionId: "a", homeId: "vit", awayId: "bahia", events: [...ours, ...whistles] },
    ],
    clubs: { fla: club("fla"), rem: club("rem"), vit: club("vit"), bahia: club("bahia") },
    names: {},
    table: null,
    ratings: null,
    seenMinute: 0,
    coach: hasCoach
      ? { fixtureId: "ours", side: "away", starters: [], benchIds: [], squad: [], tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null }, lastChangeMinute: 0, incidentHandling: "askCoach", shootout: { kickers: [], isOverruled: false } }
      : null,
  };
}

const goal = (minute: number, clubId: string): MatchEvent => ({ type: "goal", minute, clubId, playerId: `${clubId}-9` });

test("the referee whistles the kick-off, half-time, the second half and full time", () => {
  const round = roundWith([]);
  expect(roundCues(round, 0, 1)).toEqual(["kickOff"]);
  expect(roundCues(round, 44, 45)).toEqual(["halfTime"]);
  expect(roundCues(round, 45, 46)).toEqual(["kickOff"]);
  expect(roundCues(round, 89, 90)).toEqual(["fullTime"]);
  expect(roundCues(round, 10, 11)).toEqual([]);
});

test("the coach's goals roar, the goals he concedes boo, and goals elsewhere sound from afar", () => {
  const round = roundWith([goal(10, "bahia"), goal(20, "vit")], [goal(10, "fla")]);
  expect(roundCues(round, 9, 10)).toEqual(["otherGoal", "coachGoal"]);
  expect(roundCues(round, 19, 20)).toEqual(["conceded"]);
});

test("taking the lead after trailing is a comeback, once a match; levelling is just a goal", () => {
  const round = roundWith([goal(5, "vit"), goal(30, "bahia"), goal(60, "bahia"), goal(70, "vit"), goal(80, "bahia")]);
  expect(roundCues(round, 29, 30)).toEqual(["coachGoal"]);
  expect(roundCues(round, 59, 60)).toEqual(["comeback"]);
  expect(roundCues(round, 79, 80)).toEqual(["coachGoal"]);
});

test("cards and injuries in the coach's match have their own sounds; elsewhere they stay quiet", () => {
  const round = roundWith(
    [
      { type: "card", minute: 12, clubId: "vit", playerId: "v4", card: "yellow" },
      { type: "card", minute: 13, clubId: "bahia", playerId: "b4", card: "red" },
      { type: "injury", minute: 14, clubId: "bahia", playerId: "b2", days: 10 },
      { type: "substitution", minute: 15, clubId: "bahia", playerId: "b12", offId: "b2" },
    ],
    [{ type: "card", minute: 12, clubId: "fla", playerId: "f4", card: "red" }],
  );
  expect(roundCues(round, 11, 15)).toEqual(["card", "redCard", "injury"]);
});

test("without a coach's match every goal sounds from afar", () => {
  const round = roundWith([goal(10, "bahia")], [], false);
  expect(roundCues(round, 9, 10)).toEqual(["otherGoal"]);
});

test("at 1x a busy minute plays up to three different sounds, the most important first, never the same one twice", () => {
  const cues = roundCues(roundWith([goal(10, "bahia")], [goal(10, "fla"), goal(10, "rem")]), 9, 10);
  expect(cues).toEqual(["otherGoal", "otherGoal", "coachGoal"]);
  expect(thinCues(cues, 1)).toEqual(["coachGoal", "otherGoal"]);
  expect(thinCues(["otherGoal", "card", "injury", "halfTime"], 1)).toEqual(["halfTime", "injury", "card"]);
});

test("faster clocks thin a minute's sounds to two at 2x and one at 4x", () => {
  const busy = ["otherGoal", "card", "conceded", "halfTime"] as const;
  expect(thinCues(busy, 2)).toEqual(["conceded", "halfTime"]);
  expect(thinCues(busy, 4)).toEqual(["conceded"]);
  expect(thinCues([], 4)).toEqual([]);
});

test("the crowd swells when the coach's side is about to score and just after, and drops while it trails", () => {
  const round = roundWith([goal(10, "vit"), goal(50, "bahia")]);
  expect(crowdLevel(round, 5)).toBe(0.6);
  expect(crowdLevel(round, 20)).toBe(0.4);
  expect(crowdLevel(round, 48)).toBe(1);
  expect(crowdLevel(round, 51)).toBe(1);
  expect(crowdLevel(round, 60)).toBe(0.6);
  expect(crowdLevel(roundWith([], [], false), 30)).toBe(0.5);
});
