import { describe, expect, test } from "vitest";
import type { PositionGroup } from "../../src/engine/match.js";
import type { Tactics } from "../../src/sim/coach/tactics.js";
import type { MatchEvent } from "../../src/sim/live/matchTimeline.js";
import {
  bringOn,
  canBringOn,
  changeTactics,
  kickOffOf,
  lineupProblem,
  liveChangeOf,
  liveLimits,
  openSheet,
  pick,
  subsLeft,
  undo,
  type SheetMode,
} from "./lineupDraft.js";
import type { CoachSide } from "./liveRoundOf.js";
import type { PlayerStatus, SquadPlayer } from "./matchDayPlan.js";

const player = (id: string, group: PositionGroup, status: PlayerStatus = null): SquadPlayer => ({ id, name: `Jogador ${id}`, group, strength: 70, fatigue: 0, status });

const GROUPS: PositionGroup[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"];
const starters = GROUPS.map((group, i) => player(`s${i}`, group));
const bench = [player("b0", "GK"), player("b1", "DEF"), player("b2", "MID"), player("b3", "ATT"), player("b4", "ATT"), player("b5", "MID"), player("b6", "DEF")];
const hurt = player("x1", "ATT", "injured");
const banned = player("x2", "MID", "suspended");
const squad = [...starters, ...bench, hurt, banned];
const eleven = starters.map((p) => p.id);
const tactics: Tactics = { formation: "4-4-2", posture: "balanced", penaltyTakerId: "s10" };
const preMatch: SheetMode = { kind: "preMatch" };

const coach: CoachSide = { fixtureId: "f", side: "home", starters: eleven, benchIds: bench.map((p) => p.id), squad, tactics, lastChangeMinute: 0 };
const sub = (minute: number, onId: string, offId: string): MatchEvent => ({ type: "substitution", minute, clubId: "bahia", playerId: onId, offId });
const live = (events: MatchEvent[], minute: number): SheetMode => ({ kind: "live", ...liveLimits(coach, events, "bahia", minute) });

function swap(sheet: ReturnType<typeof openSheet>, mode: SheetMode, offId: string, on: SquadPlayer) {
  return bringOn(pick(sheet, mode, offId), mode, on);
}

describe("before kick-off", () => {
  test("the assistant's eleven can kick off", () => {
    expect(lineupProblem(eleven, squad)).toBeNull();
  });

  test("the eleven needs exactly one goalkeeper", () => {
    const noKeeper = swap(openSheet(eleven, tactics), preMatch, "s0", bench[1] as SquadPlayer);
    expect(lineupProblem(noKeeper.lineup, squad)).toBe("Escale um goleiro.");
    const twoKeepers = swap(openSheet(eleven, tactics), preMatch, "s1", bench[0] as SquadPlayer);
    expect(lineupProblem(twoKeepers.lineup, squad)).toBe("Só um goleiro pode começar.");
  });

  test("the eleven needs eleven players", () => {
    expect(lineupProblem(eleven.slice(1), squad)).toBe("Escale 11 jogadores.");
  });

  test("injured and suspended players can't come in, and can't kick off", () => {
    const picked = pick(openSheet(eleven, tactics), preMatch, "s9");
    expect(canBringOn(picked, preMatch, hurt)).toBe(false);
    expect(canBringOn(picked, preMatch, banned)).toBe(false);
    expect(canBringOn(picked, preMatch, bench[3] as SquadPlayer)).toBe(true);
    expect(lineupProblem([...eleven.slice(0, 10), "x1"], squad)).toBe("Jogador x1 está machucado.");
    expect(lineupProblem([...eleven.slice(0, 10), "x2"], squad)).toBe("Jogador x2 está suspenso.");
  });

  test("nobody comes in until a starter is picked to go off", () => {
    expect(canBringOn(openSheet(eleven, tactics), preMatch, bench[3] as SquadPlayer)).toBe(false);
  });

  test("taking the penalty taker out leaves the penalties to the best forward", () => {
    const swapped = swap(openSheet(eleven, tactics), preMatch, "s10", bench[3] as SquadPlayer);
    expect(swapped.tactics.penaltyTakerId).toBeNull();
  });

  test("changing only the formation kicks off with the eleven shown, not a new pick for the new shape", () => {
    const reshaped = changeTactics(openSheet(eleven, tactics), { formation: "3-5-2" });
    expect(kickOffOf(reshaped, eleven, tactics)).toEqual({ lineup: eleven, tactics: { ...tactics, formation: "3-5-2" } });
  });

  test("an untouched sheet kicks off with no choices, so the day plays as the sim would", () => {
    expect(kickOffOf(openSheet(eleven, tactics), eleven, tactics)).toEqual({});
    const changed = changeTactics(swap(openSheet(eleven, tactics), preMatch, "s9", bench[3] as SquadPlayer), { posture: "attacking" });
    expect(kickOffOf(changed, eleven, tactics)).toEqual({ lineup: changed.lineup, tactics: { ...tactics, posture: "attacking" } });
  });

  test("undo walks back one change at a time", () => {
    const sheet = changeTactics(swap(openSheet(eleven, tactics), preMatch, "s9", bench[3] as SquadPlayer), { formation: "4-3-3" });
    const once = undo(sheet);
    expect(once.tactics.formation).toBe("4-4-2");
    expect(once.lineup).toContain("b3");
    expect(undo(once).lineup).toEqual(eleven);
  });
});

describe("during the match", () => {
  test("five substitutions in all, then no more", () => {
    const four = [sub(46, "b1", "s1"), sub(46, "b2", "s5"), sub(60, "b3", "s9"), sub(60, "b5", "s6")];
    const mode = live(four, 70);
    const sheet = swap(openSheet(mode.kind === "live" ? mode.onPitch : [], tactics), mode, "s10", bench[4] as SquadPlayer);
    expect(sheet.subs).toEqual([{ offId: "s10", onId: "b4" }]);
    expect(subsLeft(sheet, mode)).toBe(0);
    expect(pick(sheet, mode, "s2").picked).toBeNull();
  });

  test("three windows during play, half-time not counting as one", () => {
    const threeWindows = [sub(45, "b1", "s1"), sub(55, "b2", "s5"), sub(65, "b3", "s9"), sub(75, "b4", "s10")];
    expect(subsLeft(openSheet(eleven, tactics), live(threeWindows, 80))).toBe(0);
    expect(subsLeft(openSheet(eleven, tactics), live(threeWindows.slice(0, 3), 80))).toBe(2);
    expect(subsLeft(openSheet(eleven, tactics), live(threeWindows, 75))).toBe(1);
  });

  test("a player who came off can't come back, and one sent off can't be replaced", () => {
    const events: MatchEvent[] = [sub(30, "b3", "s9"), { type: "card", minute: 40, clubId: "bahia", playerId: "s2", card: "red" }];
    const mode = live(events, 50);
    const sheet = openSheet(mode.kind === "live" ? mode.onPitch : [], tactics);
    expect(sheet.lineup).toContain("b3");
    expect(pick(sheet, mode, "s2").picked).toBeNull();
    const picked = pick(sheet, mode, "s10");
    expect(canBringOn(picked, mode, starters[9] as SquadPlayer)).toBe(false);
    expect(canBringOn(picked, mode, bench[4] as SquadPlayer)).toBe(true);
  });

  test("injured and suspended squad players are not on the bench", () => {
    const picked = pick(openSheet(eleven, tactics), live([], 10), "s10");
    expect(canBringOn(picked, live([], 10), hurt)).toBe(false);
    expect(canBringOn(picked, live([], 10), banned)).toBe(false);
  });

  test("no changes after the final whistle", () => {
    expect(subsLeft(openSheet(eleven, tactics), live([], 90))).toBe(0);
  });

  test("the live change carries the substitutions and only the tactics that changed", () => {
    const mode = live([], 30);
    const sheet = changeTactics(swap(openSheet(eleven, tactics), mode, "s9", bench[3] as SquadPlayer), { posture: "defensive" });
    expect(liveChangeOf(sheet, tactics)).toEqual({ substitutions: [{ offId: "s9", onId: "b3" }], posture: "defensive" });
    expect(liveChangeOf(openSheet(eleven, tactics), tactics)).toBeNull();
  });
});
