import { describe, expect, it } from "vitest";
import { compareMean, compareShare } from "./calibrationBands.js";

describe("calibration bands", () => {
  it("passes a share inside the band and fails one outside", () => {
    expect(compareShare(0.45, 0.46, 1_000_000, 1_000_000, 0.02).pass).toBe(true);
    expect(compareShare(0.45, 0.48, 1_000_000, 1_000_000, 0.02).pass).toBe(false);
  });

  it("widens the band to two standard errors when the samples are small", () => {
    const small = compareShare(0.45, 0.5, 200, 200, 0.02);
    expect(small.band).toBeCloseTo(2 * Math.sqrt(0.45 * 0.55 * (2 / 200)), 6);
    expect(small.pass).toBe(true);
  });

  it("never narrows the band under the floor, however many games there are", () => {
    expect(compareMean(2.5, 2.55, 2.5, 10_000_000, 10_000_000, 0.1).band).toBe(0.1);
  });

  it("fails a mean that differs by more than the band", () => {
    expect(compareMean(2.5, 2.9, 2.5, 5_000, 5_000, 0.1).pass).toBe(false);
  });
});
