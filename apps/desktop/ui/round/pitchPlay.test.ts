import { expect, test } from "vitest";
import type { PitchAction } from "./pitchActions.js";
import { ballAt, beatsBetween, playScript, tokensAt } from "./pitchPlay.js";

const MS = 110;
const at = (minute: number) => minute * MS;
const homeGoal: PitchAction = { kind: "goal", minute: 10, side: "home", playerId: "h9", tag: "Everaldo", setPiece: null };
const awayGoal: PitchAction = { kind: "goal", minute: 60, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null };
const halfTime: PitchAction = { kind: "halfTime", minute: 45 };
const lineups = { home: { formation: "4-4-2", sentOff: 0 }, away: { formation: "4-3-3", sentOff: 0 } } as const;

test("a goal's ball crosses the line of the goal its side attacks at the goal's minute, and the sides swap ends at half-time", () => {
  const script = playScript([homeGoal, halfTime, awayGoal], "fixture-1", MS);
  // Home attacks the right goal in the first half; away attacks it in the second.
  expect(ballAt(script, at(10)).x).toBeGreaterThanOrEqual(1);
  expect(ballAt(script, at(60)).x).toBeGreaterThanOrEqual(1);
  const goals = script.beats.filter((beat) => beat.kind === "goal");
  expect(goals.map((beat) => [beat.t, beat.side, beat.tag])).toEqual([
    [at(10), "home", "Everaldo"],
    [at(60), "away", "Kayzer"],
  ]);
});

test("the board never scores a goal of its own: its made-up chances end saved or wide, and only real chances carry a name", () => {
  const script = playScript([halfTime], "fixture-2", MS);
  const kinds = new Set(script.beats.map((beat) => beat.kind));
  expect(kinds.has("goal")).toBe(false);
  expect(kinds.has("save") || kinds.has("wide")).toBe(true);
  expect(script.beats.every((beat) => beat.tag === null)).toBe(true);
});

test("a missed penalty is struck from the spot and ends wide of the goal its side attacks, under the taker's name", () => {
  const miss: PitchAction = { kind: "chance", minute: 30, side: "away", playerId: "a10", tag: "Matheuzinho perde o pênalti", outcome: "wide", setPiece: "penalty" };
  const script = playScript([miss, halfTime], "fixture-3", MS);
  const shot = script.beats.find((beat) => beat.kind === "shot" && beat.tag !== null);
  expect(shot?.tag).toBe("Matheuzinho perde o pênalti");
  // Away attacks the left goal in the first half: the spot is 11 m out from it.
  const spot = ballAt(script, (shot?.t ?? 0) - 1);
  expect(spot.x).toBeCloseTo(11 / 105, 2);
  expect(spot.y).toBeCloseTo(0.5, 2);
  expect(script.beats.find((beat) => beat.kind === "wide" && beat.t === at(30))?.side).toBe("away");
});

test("cards, injuries and substitutions happen on the board at their minute, to their player", () => {
  const actions: PitchAction[] = [
    { kind: "card", minute: 12, side: "home", playerId: "h4", tag: "Amarelo para Wagner", card: "yellow" },
    { kind: "injury", minute: 30, side: "away", playerId: "a2", tag: "Gilberto se machucou" },
    { kind: "substitution", minute: 31, side: "away", playerId: "a14", tag: "Entra Cauly, sai Gilberto" },
    halfTime,
  ];
  const script = playScript(actions, "fixture-4", MS);
  expect(beatsBetween(script, at(11), at(32)).filter((beat) => beat.tag !== null).map((beat) => [beat.t, beat.kind, beat.playerId])).toEqual([
    [at(12), "yellow", "h4"],
    [at(30), "injury", "a2"],
    [at(31), "substitution", "a14"],
  ]);
});

test("each side lines up in its formation, and a red card takes one of its players off the board", () => {
  const script = playScript([halfTime], "fixture-5", MS);
  const full = tokensAt(script, at(20), lineups);
  expect(full.filter((token) => token.side === "home")).toHaveLength(11);
  const down = tokensAt(script, at(20), { ...lineups, away: { formation: "4-3-3", sentOff: 1 } });
  expect(down.filter((token) => token.side === "away")).toHaveLength(10);
  expect(down.filter((token) => token.side === "away" && token.isKeeper)).toHaveLength(1);
});

test("goals a minute apart at the fastest clock still each reach the net at their own minute", () => {
  const quick: PitchAction[] = [
    { kind: "goal", minute: 20, side: "home", playerId: "h9", tag: "Everaldo", setPiece: null },
    { kind: "goal", minute: 21, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null },
    { kind: "goal", minute: 22, side: "away", playerId: "a10", tag: "Matheuzinho", setPiece: "penalty" },
    halfTime,
  ];
  const script = playScript(quick, "fixture-6", MS);
  expect(ballAt(script, at(20)).x).toBeGreaterThanOrEqual(1);
  expect(ballAt(script, at(21)).x).toBeLessThanOrEqual(0);
  expect(ballAt(script, at(22)).x).toBeLessThanOrEqual(0);
  expect(script.keys.every((key, i) => i === 0 || key.t > (script.keys[i - 1]?.t ?? 0))).toBe(true);
});
