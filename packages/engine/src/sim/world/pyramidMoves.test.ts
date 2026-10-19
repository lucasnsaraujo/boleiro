import { describe, expect, it } from "vitest";
import { pyramidMoves } from "./pyramidMoves.js";

describe("pyramidMoves", () => {
  it("sends promoted clubs up one level, relegated ones down one, and the bottom's relegated out of the pyramid", () => {
    const outcomes = new Map([
      ["1", { promotedIds: [], relegatedIds: ["a19", "a20"] }],
      ["2", { promotedIds: ["b1", "b2"], relegatedIds: ["b23", "b24"] }],
      ["3", { promotedIds: ["c1", "c2"], relegatedIds: ["c30"] }],
    ]);
    const moves = pyramidMoves(["1", "2", "3"], outcomes);
    expect(Object.fromEntries(moves)).toEqual({ a19: "2", a20: "2", b1: "1", b2: "1", b23: "3", b24: "3", c1: "2", c2: "2", c30: null });
  });

  it("leaves a club that neither went up nor down out of the moves", () => {
    const moves = pyramidMoves(["1", "2"], new Map([["1", { promotedIds: [], relegatedIds: ["x"] }], ["2", { promotedIds: ["y"], relegatedIds: [] }]]));
    expect(moves.has("z")).toBe(false);
    expect([...moves.keys()]).toEqual(["x", "y"]);
  });

  it("ignores promotion from the top level", () => {
    const moves = pyramidMoves(["1"], new Map([["1", { promotedIds: ["champion"], relegatedIds: [] }]]));
    expect(moves.size).toBe(0);
  });
});
