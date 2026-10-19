import { describe, expect, it } from "vitest";
import type { Role } from "@boleiro/data/players";
import { matchOdds, type PositionGroup } from "../../engine/match.js";
import { CARD_RATES } from "../discipline/cardRates.js";
import { markedCardRates } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import { goalMinuteWeights } from "../live/matchTimeline.js";
import { engineTeam } from "../players/matchSetup.js";
import { freshCondition } from "../players/openingProfile.js";
import { aiPosture, DEFAULT_TACTICS, type Tactics } from "./tactics.js";

const player = (id: string, group: PositionGroup, strength: number): SimPlayer => ({
  id, name: id, group, strength, clubId: "club", wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const shape: [PositionGroup, number][] = [["GK", 1], ["DEF", 4], ["MID", 4], ["ATT", 2]];
const fourFourTwo = shape.flatMap(([group, count]) => Array.from({ length: count }, (_, i) => player(`${group}${i}`, group, 70)));
const plain = (p: SimPlayer) => p.strength;
const opponent = engineTeam("Away", fourFourTwo, plain);

describe("the coach's formation", () => {
  it("costs goals when it leaves his eleven out of position", () => {
    const fitting = matchOdds(engineTeam("Home", fourFourTwo, plain, DEFAULT_TACTICS), opponent);
    const misfit = matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, formation: "4-3-3" }), opponent);
    expect(fitting).toEqual(matchOdds(engineTeam("Home", fourFourTwo, plain), opponent));
    expect(misfit.expectedHomeGoals).toBeLessThan(fitting.expectedHomeGoals);
  });
});

describe("the coach's posture", () => {
  const goals = (posture: Tactics["posture"], against: Tactics["posture"] = "balanced") =>
    matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, posture }), engineTeam("Away", fourFourTwo, plain, { ...DEFAULT_TACTICS, posture: against }));

  it("on the counter gives up a few chances to concede fewer, and pays against a side that attacks", () => {
    const balanced = goals("balanced");
    const counter = goals("counter");
    expect(counter.expectedHomeGoals / balanced.expectedHomeGoals).toBeCloseTo(0.92, 2);
    expect(counter.expectedAwayGoals / balanced.expectedAwayGoals).toBeCloseTo(0.9, 2);
    const againstAttack = goals("counter", "attacking").expectedHomeGoals / goals("balanced", "attacking").expectedHomeGoals;
    expect(againstAttack).toBeCloseTo(0.92 * 1.1, 2);
  });

  it("parks the bus deeper than the counter and attacks more openly than balanced", () => {
    const [bus, counter, balanced, attacking] = (["defensive", "counter", "balanced", "attacking"] as const).map((p) => goals(p));
    expect(bus?.expectedAwayGoals).toBeLessThan(counter?.expectedAwayGoals ?? 0);
    expect(counter?.expectedAwayGoals).toBeLessThan(balanced?.expectedAwayGoals ?? 0);
    expect(attacking?.expectedHomeGoals).toBeGreaterThan(balanced?.expectedHomeGoals ?? 0);
  });
});

describe("the coach's marking", () => {
  const opponentGoals = (marking?: Tactics["marking"]) =>
    matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, ...(marking ? { marking } : {}) }), opponent).expectedAwayGoals;

  it("plays heavy when left untouched", () => {
    expect(opponentGoals("heavy")).toBe(opponentGoals());
  });

  it("takes chances off the opponent the heavier it is", () => {
    expect(opponentGoals("light") / opponentGoals()).toBeCloseTo(1.06, 3);
    expect(opponentGoals("veryHeavy") / opponentGoals()).toBeCloseTo(0.94, 3);
  });

  it("costs the marking side cards the heavier it is, and leaves the real rates alone when heavy", () => {
    const rates = CARD_RATES.A;
    expect(markedCardRates(rates, { home: "heavy" })).toEqual(rates);
    expect(markedCardRates(rates, {})).toEqual(rates);
    const heavy = markedCardRates(rates, { home: "veryHeavy", away: "light" });
    expect(heavy.home.yellows).toBeCloseTo(rates.home.yellows * 1.45, 9);
    expect(heavy.home.reds).toBeCloseTo(rates.home.reds * 1.45, 9);
    expect(heavy.away.yellows).toBeCloseTo(rates.away.yellows * 0.7, 9);
    expect(heavy.secondYellowShare).toBe(rates.secondYellowShare);
  });
});

describe("the coach's play", () => {
  const placed = (id: string, role: Role, strength: number): SimPlayer => ({
    ...player(id, role === "goleiro" ? "GK" : role === "atacante" ? "ATT" : role === "meia" ? "MID" : "DEF", strength),
    positions: [role],
  });
  // A 4-3-3 whose left winger is far better than the full-back he runs at.
  const roles: Role[] = ["goleiro", "lateral", "zagueiro", "zagueiro", "lateral", "meia", "meia", "meia", "atacante", "atacante", "atacante"];
  const withLeftWinger = (strength: number) => roles.map((role, i) => placed(`p${i}`, role, i === 8 ? strength : 70));
  const placedOpponent = engineTeam("Away", fourFourTwo, plain, DEFAULT_TACTICS);
  const goals = (play?: Tactics["play"], winger = 85) =>
    matchOdds(engineTeam("Home", withLeftWinger(winger), plain, { ...DEFAULT_TACTICS, formation: "4-3-3", ...(play ? { play } : {}) }), placedOpponent).expectedHomeGoals;

  it("pays down the flanks where the coach's winger beats their full-back, and costs through the middle", () => {
    expect(goals("flanks")).toBeGreaterThan(goals());
    expect(goals("middle")).toBeLessThan(goals());
  });

  it("stays small: at most 6% either way", () => {
    expect(goals("flanks", 99) / goals(undefined, 99)).toBeCloseTo(1.06, 3);
    expect(goals("middle", 99) / goals(undefined, 99)).toBeCloseTo(0.94, 3);
  });

  it("changes nothing for a side placed without a formation", () => {
    const loose = (play?: Tactics["play"]) => matchOdds({ ...engineTeam("Home", withLeftWinger(85), plain), ...(play ? { play } : {}) }, placedOpponent).expectedHomeGoals;
    expect(loose("flanks")).toBe(loose());
  });
});

describe("the coach's penalty taker", () => {
  const withTaker = (strength: number) => {
    const eleven = [...fourFourTwo.slice(0, -1), player("taker", "MID", strength)];
    return matchOdds(engineTeam("Home", eleven, plain, { ...DEFAULT_TACTICS, penaltyTakerId: "taker" }), opponent).expectedHomeGoals;
  };

  it("scores more penalties the stronger he is", () => {
    expect(withTaker(90)).toBeGreaterThan(withTaker(50));
  });

  it("counts only while he is on the pitch", () => {
    const absent = matchOdds(engineTeam("Home", fourFourTwo, plain, { ...DEFAULT_TACTICS, penaltyTakerId: "someone-on-the-bench" }), opponent);
    expect(absent).toEqual(matchOdds(engineTeam("Home", fourFourTwo, plain, DEFAULT_TACTICS), opponent));
  });
});

describe("an AI coach's posture", () => {
  it("stays balanced until the score and the clock call for something else", () => {
    expect(aiPosture(-1, 30)).toBe("balanced");
    expect(aiPosture(-1, 70)).toBe("attacking");
    expect(aiPosture(1, 70)).toBe("balanced");
    expect(aiPosture(1, 80)).toBe("defensive");
    expect(aiPosture(0, 89)).toBe("balanced");
  });
});

describe("a red card in a live match", () => {
  it("cuts the ten men's goal chances and raises their opponent's from that minute on", () => {
    const tenMen = goalMinuteWeights([60], [], 0);
    const full = goalMinuteWeights([], [], 0);
    const against = goalMinuteWeights([], [60], 0);
    expect(tenMen.slice(0, 60)).toEqual(full.slice(0, 60));
    expect(tenMen[70]).toBeCloseTo(((full[70] ?? 0) * 2) / 3, 12);
    expect(against[70]).toBeCloseTo(((full[70] ?? 0) * 5) / 4, 12);
  });
});
