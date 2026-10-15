import { describe, expect, it } from "vitest";
import type { ContinentalCompetition } from "../gameState.js";
import { CONMEBOL_CUPS, cupStageDates } from "./conmebolCups.js";

const GROUPS = 8;
const winner = (g: number) => `w${g}`;
const runnerUp = (g: number) => `r${g}`;

/** A Libertadores with its group stage drawn and no match played, so each group stands in draw order. */
function afterGroups(drawOrder: string[]): ContinentalCompetition {
  const groups = Array.from({ length: GROUPS }, (_, g) => [winner(g), runnerUp(g), `x${g}`, `y${g}`]);
  const none = { kind: "knockout" as const, ties: [], dates: [] };
  return {
    id: "libertadores-2026",
    kind: "continental",
    cup: "libertadores",
    season: 2026,
    clubIds: groups.flat(),
    entries: [],
    countries: {},
    stages: [none, none, none, { kind: "groups", groups, legs: 2, dates: [] }],
    stageDates: cupStageDates("libertadores", 2026),
    drawOrder,
  };
}

describe("the Libertadores round of 16 draw", () => {
  it("never pairs two clubs of the same group, even when the draw order would leave a group's winner its own runner-up last", () => {
    // Drawn in this order, a pick of the first eligible runner-up leaves w3 with r3 at the end.
    const hosts = [0, 5, 7, 1, 4, 2, 6, 3].map(winner);
    const visitors = [4, 1, 6, 7, 0, 5, 2, 3].map(runnerUp);
    const rest = Array.from({ length: GROUPS }, (_, g) => [`x${g}`, `y${g}`]).flat();
    const shape = CONMEBOL_CUPS.nextStage(afterGroups([...hosts, ...visitors, ...rest]), { competitions: {}, fixtures: [] });
    const ties = shape.kind === "knockout" ? shape.ties : [];
    expect(ties).toHaveLength(GROUPS);
    expect(ties.map(([host]) => host).toSorted()).toEqual(hosts.toSorted());
    expect(ties.map(([, visitor]) => visitor).toSorted()).toEqual(visitors.toSorted());
    expect(ties.filter(([host, visitor]) => host.slice(1) === visitor.slice(1))).toEqual([]);
  });
});
