import { COACH_ROSTER } from "@boleiro/data/coachRoster";
import { describe, expect, it } from "vitest";
import { randomStream } from "../../engine/random.js";
import { inventCoachName } from "./inventCoachName.js";

describe("an invented coach's name", () => {
  it("is never a real coach's from Transfermarkt's lists", () => {
    const real = new Set(Object.values(COACH_ROSTER).map((coach) => coach.name));
    const stream = randomStream(1);
    const invented = ["br", "ar", "gb-eng", "es", "it", "pt", "de", "tr"].flatMap((country) => Array.from({ length: 3000 }, () => inventCoachName(country, stream.next).name));
    expect(invented.filter((name) => real.has(name))).toEqual([]);
  });
});
