import { describe, expect, it } from "vitest";
import type { Role } from "@boleiro/data/players";
import { GROUP_OF_ROLE } from "@boleiro/data/players";
import { DEFAULT_TACTICS, type Tactics } from "./tactics.js";
import { followAssistant, tacticsBoard, type BoardPlayer, type BoardSide } from "./tacticsBoard.js";

const FOUR_FOUR_TWO: Role[] = ["goleiro", "lateral", "zagueiro", "zagueiro", "lateral", "meia", "meia", "meia", "meia", "atacante", "atacante"];
const FOUR_THREE_THREE: Role[] = ["goleiro", "lateral", "zagueiro", "zagueiro", "lateral", "meia", "meia", "meia", "atacante", "atacante", "atacante"];

const eleven = (prefix: string, roles: readonly Role[], strength: (i: number) => number = () => 70): BoardPlayer[] =>
  roles.map((role, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, group: GROUP_OF_ROLE[role], positions: [role], strength: strength(i) }));
const side = (players: BoardPlayer[], tactics: Partial<Tactics> = {}): BoardSide => ({ name: "x", eleven: players, tactics: { ...DEFAULT_TACTICS, ...tactics } });
const kickOff = { isHome: true, minute: 0, lead: 0 };

describe("the tactics board", () => {
  it("rates each sector of both sides from the players placed there", () => {
    const board = tacticsBoard(side(eleven("a", FOUR_FOUR_TWO, (i) => (i >= 9 ? 80 : 70))), side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.sectors.own).toEqual({ DEF: 70, MID: 70, ATT: 80 });
    expect(board.sectors.opponent).toEqual({ DEF: 70, MID: 70, ATT: 70 });
  });

  it("sends the coach's left flank at the opponent's right-back", () => {
    // In a 4-4-2 the fifth slot is the right-back.
    const opponent = side(eleven("b", FOUR_FOUR_TWO, (i) => (i === 4 ? 50 : 70)));
    const lanes = tacticsBoard(side(eleven("a", FOUR_FOUR_TWO)), opponent, kickOff).lanes;
    const left = lanes.find((l) => l.lane === "left");
    const right = lanes.find((l) => l.lane === "right");
    expect(left?.defense).toBeLessThan(right?.defense ?? 0);
    expect(right?.defender?.name).not.toBe("b4");
  });

  it("shows how the chosen posture moves both sides' chances against balanced", () => {
    const board = tacticsBoard(side(eleven("a", FOUR_FOUR_TWO), { posture: "attacking" }), side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.postureChances.own).toBeCloseTo(1.15, 6);
    expect(board.postureChances.theirs).toBeCloseTo(1.2, 6);
  });
});

describe("the assistant", () => {
  it("sends the play down the flanks where the coach's winger beats their full-back, naming the duel", () => {
    // In a 4-3-3 the left winger is the ninth slot.
    const own = side(eleven("a", FOUR_THREE_THREE, (i) => (i === 8 ? 85 : 70)), { formation: "4-3-3" });
    const board = tacticsBoard(own, side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.assistant.play.value).toBe("flanks");
    expect(board.assistant.play.duel).toMatchObject({ lane: "left", attacker: { name: "a8", strength: 85 } });
    expect(board.lanes.find((l) => l.lane === "left")?.attack).toBeGreaterThan(board.lanes.find((l) => l.lane === "centre")?.attack ?? 0);
  });

  it("sits a far weaker side deeper away from home, and throws a side losing late forward", () => {
    const weak = side(eleven("a", FOUR_FOUR_TWO, () => 55));
    const strong = side(eleven("b", FOUR_FOUR_TWO, () => 82));
    expect(["defensive", "counter"]).toContain(tacticsBoard(weak, strong, { isHome: false, minute: 0, lead: 0 }).assistant.posture.value);
    const even = side(eleven("b", FOUR_FOUR_TWO));
    expect(tacticsBoard(side(eleven("a", FOUR_FOUR_TWO)), even, { isHome: true, minute: 80, lead: -1 }).assistant.posture.value).toBe("attacking");
  });

  it("gives the posture with the most points it expects, and those points beside the coach's own", () => {
    const board = tacticsBoard(side(eleven("a", FOUR_FOUR_TWO), { posture: "attacking" }), side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.assistant.posture.points).toBeGreaterThanOrEqual(board.assistant.posture.currentPoints);
  });

  it("leaves the coach's posture alone when another would add less than a hundredth of a point", () => {
    const strong = eleven("a", FOUR_FOUR_TWO, () => 78);
    const weak = side(eleven("b", FOUR_FOUR_TWO, () => 48));
    for (const posture of ["defensive", "counter", "balanced", "attacking"] as const) {
      for (const moment of [kickOff, { isHome: true, minute: 45, lead: 1 }, { isHome: false, minute: 70, lead: 2 }]) {
        const { value, points, currentPoints } = tacticsBoard(side(strong, { posture }), weak, moment).assistant.posture;
        if (value !== posture) expect(points - currentPoints).toBeGreaterThanOrEqual(0.01);
      }
    }
  });

  it("marks light when two starters are a yellow from a ban, naming them", () => {
    const players = eleven("a", FOUR_FOUR_TWO).map((p, i) => (i === 5 || i === 6 ? { ...p, isOneYellowFromBan: true } : p));
    const board = tacticsBoard(side(players), side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.assistant.marking).toEqual({ value: "light", reason: { kind: "booked", names: ["a5", "a6"] } });
  });

  it("marks very heavy when their attack outguns the coach's defence and nobody is close to a ban", () => {
    const board = tacticsBoard(side(eleven("a", FOUR_FOUR_TWO)), side(eleven("b", FOUR_FOUR_TWO, (i) => (i >= 9 ? 85 : 70))), kickOff);
    expect(board.assistant.marking.value).toBe("veryHeavy");
    expect(tacticsBoard(side(eleven("a", FOUR_FOUR_TWO)), side(eleven("b", FOUR_FOUR_TWO)), kickOff).assistant.marking.value).toBe("heavy");
  });

  it("picks the formation the eleven fits", () => {
    const board = tacticsBoard(side(eleven("a", FOUR_THREE_THREE), { formation: "4-4-2" }), side(eleven("b", FOUR_FOUR_TWO)), kickOff);
    expect(board.assistant.formation.value).toBe("4-3-3");
    expect(board.formations).toContain("4-3-3");
    expect(board.formations).toContain("4-4-2");
  });

  it("is followed one dial at a time or in everything, after which it has nothing left to change", () => {
    const own = side(eleven("a", FOUR_THREE_THREE, (i) => (i === 8 ? 85 : 70)), { formation: "4-4-2", posture: "attacking", marking: "light", play: "middle" });
    const opponent = side(eleven("b", FOUR_FOUR_TWO));
    const board = tacticsBoard(own, opponent, kickOff);
    expect(followAssistant(own.tactics, board, "play")).toEqual({ ...own.tactics, play: "flanks" });
    const followed = followAssistant(own.tactics, board);
    expect(followed.penaltyTakerId).toBe(own.tactics.penaltyTakerId);
    expect(tacticsBoard({ ...own, tactics: followed }, opponent, kickOff).changes).toBe(0);
    expect(board.changes).toBeGreaterThan(0);
  });
});
