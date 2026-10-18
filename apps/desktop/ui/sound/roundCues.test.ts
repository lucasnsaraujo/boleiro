import { expect, test } from "vitest";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { VarCheck, VarDecision } from "@boleiro/engine/sim/referees/refereeCalls";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { crowdLevel, heardCues, roundCues, thinCues, varDecisionCues } from "./roundCues.js";

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
    competitions: [{ id: "a", label: "Série A · 1ª rodada", hasHumanCoach: true }],
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
      ? { fixtureId: "ours", side: "away", starters: [], benchIds: [], squad: [], tactics: { formation: "4-4-2", posture: "balanced", penaltyTakerId: null }, rivalFormation: "4-4-2", lastChangeMinute: 0, incidentHandling: "askCoach", shootout: { kickers: [], isOverruled: false }, opponent: { clubId: "rival", name: "Rival", starters: [], bench: [], formation: "4-4-2", rivalTactics: null, form: [] }, halfTimeTalk: { moment: { lead: 0, morale: 50, isDerby: false }, suggested: "calm", given: null } }
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

test("with a match in extra time the referee whistles the end of normal time, extra time's two halves and its end", () => {
  const round = roundWith([{ type: "extraHalfTime", minute: 105 }, { type: "extraTimeEnd", minute: 120 }]);
  expect(roundCues(round, 89, 90)).toEqual(["halfTime"]);
  expect(roundCues(round, 90, 91)).toEqual(["kickOff"]);
  expect(roundCues(round, 104, 105)).toEqual(["halfTime"]);
  expect(roundCues(round, 105, 106)).toEqual(["kickOff"]);
  expect(roundCues(round, 119, 120)).toEqual(["fullTime"]);
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

const penaltyGoal = (minute: number, clubId: string): MatchEvent => ({ type: "goal", minute, clubId, playerId: `${clubId}-9`, kind: "penalty" });
const penaltyMiss = (minute: number, clubId: string): MatchEvent => ({ type: "penaltyMiss", minute, clubId, playerId: `${clubId}-9`, keeperId: "k", isSaved: true });
const varCheck = (minute: number, clubId: string, decision: VarDecision): VarCheck => ({ type: "varCheck", minute, clubId, playerId: `${clubId}-9`, decision, seconds: 100 });

test("the referee whistles a penalty before it is taken; the crowd groans when the coach's side misses and cheers when the other side does", () => {
  const round = roundWith([penaltyGoal(10, "bahia"), penaltyMiss(20, "bahia"), penaltyMiss(30, "vit")]);
  expect(roundCues(round, 9, 10)).toEqual(["penalty", "coachGoal"]);
  expect(roundCues(round, 19, 20)).toEqual(["penalty", "groan"]);
  expect(roundCues(round, 29, 30)).toEqual(["penalty", "relief"]);
});

test("away from home the coach hears his goals from the visitors' end and the home crowd's joy at the goals against; his goals bring the stinger", () => {
  expect(heardCues(["otherGoal", "coachGoal"], "away")).toEqual(["otherGoal", "coachGoalAway", "goalStinger"]);
  expect(heardCues(["conceded", "card"], "away")).toEqual(["concededAway", "card"]);
  expect(heardCues(["comeback"], "home")).toEqual(["comeback", "goalStinger"]);
  expect(heardCues(["coachGoal", "conceded"], "home")).toEqual(["coachGoal", "conceded", "goalStinger"]);
  expect(heardCues(["otherGoal", "kickOff"], null)).toEqual(["otherGoal", "kickOff"]);
});

test("in a hot-seat round every human coach's match sounds as his own, and a goal between two humans celebrates its scorer", () => {
  const round: LiveRound = { ...roundWith([goal(10, "vit")], [goal(10, "fla"), goal(20, "rem")]), otherHumanClubIds: ["fla", "vit"] };
  expect(roundCues(round, 9, 10)).toEqual(["coachGoal", "coachGoal"]);
  expect(roundCues(round, 19, 20)).toEqual(["conceded"]);
});

test("a VAR check holds back its match's sounds at its minute; its decision whistles and lets them go, or the crowd reacts to what it took back", () => {
  const awarded = roundWith([goal(30, "bahia"), varCheck(30, "bahia", "goalAwarded")], [goal(30, "fla")]);
  expect(roundCues(awarded, 29, 30, "ours")).toEqual(["otherGoal"]);
  expect(varDecisionCues(awarded, { fixtureId: "ours", check: varCheck(30, "bahia", "goalAwarded") })).toEqual(["varDecision", "coachGoal"]);

  const ruledOut = roundWith([varCheck(40, "bahia", "goalRuledOut"), varCheck(50, "vit", "goalRuledOut"), varCheck(60, "bahia", "redCardCancelled"), varCheck(70, "vit", "penaltyCancelled")]);
  const decided = (minute: number, clubId: string, decision: VarDecision) => varDecisionCues(ruledOut, { fixtureId: "ours", check: varCheck(minute, clubId, decision) });
  expect(decided(40, "bahia", "goalRuledOut")).toEqual(["varDecision", "groan"]);
  expect(decided(50, "vit", "goalRuledOut")).toEqual(["varDecision", "relief"]);
  expect(decided(60, "bahia", "redCardCancelled")).toEqual(["varDecision", "relief"]);
  expect(decided(70, "vit", "penaltyCancelled")).toEqual(["varDecision", "relief"]);
});

test("late in a close match the crowd builds, leading or trailing by one; a two-goal margin calms it", () => {
  const close = roundWith([goal(10, "vit")]);
  expect(crowdLevel(close, 70)).toBe(0.4);
  expect(crowdLevel(close, 80)).toBeGreaterThan(0.6);
  expect(crowdLevel(close, 88)).toBeGreaterThan(crowdLevel(close, 80));
  expect(crowdLevel(close, 90)).toBeCloseTo(0.95);
  const settled = roundWith([goal(10, "bahia"), goal(20, "bahia")]);
  expect(crowdLevel(settled, 88)).toBe(0.6);
});

test("in a hot-seat round the crowd follows the liveliest human coach's match", () => {
  const round: LiveRound = { ...roundWith([goal(10, "vit")], [goal(60, "fla")]), otherHumanClubIds: ["fla"] };
  expect(crowdLevel(round, 20)).toBe(0.6);
  expect(crowdLevel(round, 59)).toBe(1);
});
