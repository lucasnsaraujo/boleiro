import { describe, expect, it } from "vitest";
import { formOfTheDay } from "./formOfTheDay.js";

const NEUTRAL = { morale: 50, fatigue: 5 };
const formsOf = (pull: { morale: number; fatigue: number }) =>
  Array.from({ length: 2000 }, (_, i) => formOfTheDay(7, `fixture-${i % 40}`, `player-${i}`, pull));
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

describe("form of the day", () => {
  it("is the same for a player in a match every time it is drawn, and differs between players and matches", () => {
    expect(formOfTheDay(7, "f1", "p1", NEUTRAL)).toBe(formOfTheDay(7, "f1", "p1", NEUTRAL));
    expect(formOfTheDay(7, "f1", "p1", NEUTRAL)).not.toBe(formOfTheDay(7, "f1", "p2", NEUTRAL));
    expect(formOfTheDay(7, "f1", "p1", NEUTRAL)).not.toBe(formOfTheDay(7, "f2", "p1", NEUTRAL));
    expect(formOfTheDay(7, "f1", "p1", NEUTRAL)).not.toBe(formOfTheDay(8, "f1", "p1", NEUTRAL));
  });

  it("averages out to nothing for a squad on its usual rhythm in a neutral mood, with good and bad days alike", () => {
    const forms = formsOf(NEUTRAL);
    expect(Math.abs(mean(forms))).toBeLessThan(0.03);
    expect(forms.filter((f) => f < -0.5).length).toBeGreaterThan(100);
    expect(forms.filter((f) => f > 0.5).length).toBeGreaterThan(100);
    for (const form of forms) expect(Math.abs(form)).toBeLessThanOrEqual(1);
  });

  it("is pulled down by low morale and by fatigue, and up by high morale", () => {
    const neutral = mean(formsOf(NEUTRAL));
    expect(mean(formsOf({ morale: 10, fatigue: 5 }))).toBeLessThan(neutral - 0.1);
    expect(mean(formsOf({ morale: 50, fatigue: 100 }))).toBeLessThan(neutral - 0.1);
    expect(mean(formsOf({ morale: 90, fatigue: 5 }))).toBeGreaterThan(neutral + 0.1);
  });
});
