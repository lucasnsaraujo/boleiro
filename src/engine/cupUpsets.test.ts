import { describe, expect, it } from "vitest";
import { realCupUpsets } from "./cupUpsets.js";

describe("realCupUpsets", () => {
  const groups = realCupUpsets();
  const find = (gap: string, venue: string) => groups.find((g) => g.gap === gap && g.venue === venue);

  it("groups every cross-division Copa do Brasil match by division gap and the favourite's venue", () => {
    for (const gap of ["AvB", "AvC", "AvD", "BvC", "BvD", "CvD"]) {
      for (const venue of ["home", "away"]) expect(find(gap, venue)?.matches, `${gap} ${venue}`).toBeGreaterThan(10);
    }
  });

  it("gives each group win, draw and loss shares that add up to one", () => {
    for (const group of groups) expect(group.win + group.draw + group.loss).toBeCloseTo(1, 9);
  });

  it("shows Série A clubs winning more often at home than away against Série D or below", () => {
    const home = find("AvD", "home");
    const away = find("AvD", "away");
    expect(home?.win).toBeGreaterThan(away?.win ?? 1);
  });
});
