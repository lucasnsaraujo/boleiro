import { describe, expect, it } from "vitest";
import { travelKm } from "./travelKm.js";

describe("travelKm", () => {
  it("measures the straight line between state capitals", () => {
    expect(travelKm("SP", "RJ")).toBeGreaterThan(330);
    expect(travelKm("SP", "RJ")).toBeLessThan(380);
    expect(travelKm("RS", "AM")).toBeGreaterThan(3000);
    expect(travelKm("AM", "RS")).toBeCloseTo(travelKm("RS", "AM"));
  });

  it("counts a short trip for clubs in the same state", () => {
    expect(travelKm("MG", "MG")).toBeGreaterThan(0);
    expect(travelKm("MG", "MG")).toBeLessThan(travelKm("MG", "RJ"));
  });
});
