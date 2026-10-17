import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { rivalryOf } from "./rivalryOf.js";

const start = loadNewGame(4, { coachClubId: null });

describe("a derby between two clubs", () => {
  it("rates Fla-Flu, the Gre-Nal and the Superclássico at the top, whichever side is named first", () => {
    expect(rivalryOf("flamengo-rj", "fluminense-rj")).toEqual({ name: "Fla-Flu", intensity: 5 });
    expect(rivalryOf("fluminense-rj", "flamengo-rj")).toEqual(rivalryOf("flamengo-rj", "fluminense-rj"));
    expect(rivalryOf("internacional-rs", "gremio-rs")?.intensity).toBe(5);
    expect(rivalryOf("tm-189", "tm-209")?.intensity).toBe(5);
  });

  it("rates a city's second derby below its biggest", () => {
    const biggest = rivalryOf("corinthians-sp", "palmeiras-sp")?.intensity ?? 0;
    const smaller = rivalryOf("palmeiras-sp", "santos-sp")?.intensity ?? 0;
    expect(smaller).toBeGreaterThan(0);
    expect(smaller).toBeLessThan(biggest);
  });

  it("is no derby between clubs from different cities that the lists never pair", () => {
    expect(rivalryOf("flamengo-rj", "gremio-rs")).toBeNull();
    expect(rivalryOf("flamengo-rj", "flamengo-rj")).toBeNull();
  });
});

describe("a club's rivals", () => {
  it("are its real derby opponents among the game's clubs, the biggest derby first", () => {
    const rivals = [...(rivalsOf(start.clubs).get("palmeiras-sp") ?? [])];
    expect(rivals[0]).toBe("corinthians-sp");
    expect(rivals).toEqual(expect.arrayContaining(["sao-paulo-sp", "santos-sp"]));
    expect(rivals).not.toContain("flamengo-rj");
  });
});
