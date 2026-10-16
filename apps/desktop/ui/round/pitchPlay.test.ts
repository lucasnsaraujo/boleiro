import { expect, test } from "vitest";
import type { PitchAction } from "./pitchActions.js";
import { ballAt, beatsBetween, playScript, tokenIdOf, tokensAt } from "./pitchPlay.js";

const MS = 110;
const at = (minute: number) => minute * MS;
const homeGoal: PitchAction = { kind: "goal", minute: 10, side: "home", playerId: "h9", tag: "Everaldo", setPiece: null };
const awayGoal: PitchAction = { kind: "goal", minute: 60, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null };
const halfTime: PitchAction = { kind: "halfTime", minute: 45 };
const lineups = { home: { formation: "4-4-2", sentOff: [] }, away: { formation: "4-3-3", sentOff: [] } } as const;

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

test("each side lines up in its formation, and a red card takes off the token the carded player's actions showed on", () => {
  const script = playScript([halfTime], "fixture-5", MS);
  const full = tokensAt(script, at(20), lineups);
  expect(full.filter((token) => token.side === "home")).toHaveLength(11);
  const his = tokenIdOf("away", "a4", []);
  expect(full.some((token) => token.id === his)).toBe(true);
  const down = tokensAt(script, at(20), { ...lineups, away: { formation: "4-3-3", sentOff: ["a4"] } });
  expect(down.filter((token) => token.side === "away")).toHaveLength(10);
  expect(down.some((token) => token.id === his)).toBe(false);
  expect(down.filter((token) => token.side === "away" && token.isKeeper)).toHaveLength(1);
  // Once he is off, his card still shows where he stood, and a team-mate who'd share his token gets the next one.
  expect(tokenIdOf("away", "a4", ["a4"])).toBe(his);
  const mates = ["a1", "a2", "a3", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12", "a13", "a14"];
  expect(mates.map((id) => tokenIdOf("away", id, ["a4"]))).not.toContain(his);
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

test("a goal in first-half stoppage time goes in at the end its side attacked in the first half, and the sides change ends for the second half's kick-off", () => {
  const stoppage: PitchAction = { kind: "goal", minute: 45, side: "home", playerId: "h9", tag: "Everaldo", setPiece: null };
  const script = playScript([stoppage, halfTime, awayGoal], "fixture-7", MS);
  expect(ballAt(script, at(45)).x).toBeGreaterThanOrEqual(1);
  const homeKeeper = (minute: number) => tokensAt(script, at(minute), lineups).find((token) => token.side === "home" && token.isKeeper);
  expect(homeKeeper(45)?.x).toBeLessThan(0.5);
  expect(homeKeeper(47)?.x).toBeGreaterThan(0.5);
});

test("a goal a minute into the second half comes after the kick-off from the centre, with the ends already changed, at any clock speed", () => {
  const early: PitchAction = { kind: "goal", minute: 46, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null };
  for (const ms of [660, 330, 110]) {
    const script = playScript([halfTime, early], "fixture-8", ms);
    const kickOff = script.keys.find((key) => key.shape === "kickoff" && key.t > 45 * ms);
    expect(kickOff?.t).toBeGreaterThanOrEqual(45.5 * ms);
    // Away attacks the right goal in the second half.
    expect(ballAt(script, 46 * ms).x).toBeGreaterThanOrEqual(1);
  }
});

test("a goal in first-half stoppage time is celebrated before the ends change for the second half", () => {
  const stoppage: PitchAction = { kind: "goal", minute: 45, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null };
  const ms = 660;
  const script = playScript([stoppage, halfTime], "fixture-9", ms);
  const celebration = script.keys.find((key) => key.shape === "celebrate");
  expect(celebration?.t).toBeGreaterThan(45 * ms);
  expect(celebration?.t).toBeLessThan(45.5 * ms);
  expect(script.secondHalfAt).toBe(45.5 * ms);
});

test("with real shots to play, the board makes up no chances of its own: every strike carries a name", () => {
  const shot: PitchAction = { kind: "chance", minute: 30, side: "home", playerId: "h10", tag: "Matheuzinho chuta pra fora", outcome: "wide", setPiece: null };
  const script = playScript([homeGoal, shot, halfTime, awayGoal], "fixture-10", MS, { isMakingUpChances: false });
  const strikes = script.beats.filter((beat) => beat.kind === "shot");
  expect(strikes.map((beat) => beat.tag)).toEqual(["Everaldo", "Matheuzinho chuta pra fora", "Kayzer"]);
});

test("a goal and a missed shot in the same minute both play: the miss first, the goal at its minute, at any clock speed", () => {
  const miss: PitchAction = { kind: "chance", minute: 30, side: "home", playerId: "h10", tag: "Matheuzinho chuta pra fora", outcome: "wide", setPiece: null };
  const goal: PitchAction = { kind: "goal", minute: 30, side: "away", playerId: "a9", tag: "Kayzer", setPiece: null };
  for (const ms of [660, 110]) {
    const script = playScript([goal, miss, halfTime], "fixture-11", ms, { isMakingUpChances: false });
    const outcomes = script.beats.filter((beat) => beat.kind === "wide" || beat.kind === "goal");
    expect(outcomes.map((beat) => beat.kind)).toEqual(["wide", "goal"]);
    expect(outcomes[0]?.t).toBeLessThan(30 * ms);
    expect(outcomes[1]?.t).toBe(30 * ms);
    // Away attacks the left goal in the first half.
    expect(ballAt(script, 30 * ms).x).toBeLessThanOrEqual(0);
  }
});

test("an early goal in the first half gets its kick-off from the centre though nothing else happens before the break", () => {
  const script = playScript([homeGoal, halfTime], "fixture-12", 660, { isMakingUpChances: false });
  const restart = script.keys.find((key) => key.shape === "kickoff" && key.t > 10 * 660);
  expect(restart?.t).toBeLessThan(45 * 660);
});
