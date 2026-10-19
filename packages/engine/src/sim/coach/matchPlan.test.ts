import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { passTheSeat } from "./humanCoaches.js";
import { matchPlanOf, withMatchPlan } from "./matchPlan.js";

const hotSeat = loadNewGame(1, { coachClubId: "flamengo-rj", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] } });

describe("a coach's match plan", () => {
  it("starts empty, so every rule is off as before plans", () => {
    expect(matchPlanOf(loadNewGame(1, { coachClubId: "flamengo-rj" }))).toEqual({});
  });

  it("goes with its coach when the seat passes in a hot-seat game", () => {
    const planned = withMatchPlan(hotSeat, { keepsShape: true, tacticsKey: "q" });
    const bruno = passTheSeat(planned);
    expect(matchPlanOf(bruno)).toEqual({});
    expect(matchPlanOf(passTheSeat(bruno))).toEqual({ keepsShape: true, tacticsKey: "q" });
  });

  it("refuses a key another coach of the same keyboard already took, either of his two", () => {
    const anaTakesQ = passTheSeat(withMatchPlan(hotSeat, { tacticsKey: "q", timeOutKey: "w" }));
    expect(() => withMatchPlan(anaTakesQ, { tacticsKey: "q" })).toThrow(/"q" is Ana's/);
    expect(() => withMatchPlan(anaTakesQ, { timeOutKey: "w" })).toThrow(/"w" is Ana's/);
    expect(matchPlanOf(withMatchPlan(anaTakesQ, { tacticsKey: "o", timeOutKey: "p" }))).toEqual({ tacticsKey: "o", timeOutKey: "p" });
  });

  it("refuses one key for both of a coach's commands, and keys that are not one letter or digit", () => {
    expect(() => withMatchPlan(hotSeat, { tacticsKey: "q", timeOutKey: "q" })).toThrow(/both/);
    expect(() => withMatchPlan(hotSeat, { timeOutKey: "Q" })).toThrow(/one lowercase letter or digit/);
    expect(() => withMatchPlan(hotSeat, { timeOutKey: "F2" })).toThrow(/one lowercase letter or digit/);
  });

  it("refuses an energy floor out of its range and a planned substitution outside the ninety minutes", () => {
    expect(() => withMatchPlan(hotSeat, { energyFloor: 10 })).toThrow(/energy floor/);
    expect(() => withMatchPlan(hotSeat, { minuteSubs: [{ minute: 95, offId: "a", onId: "b" }] })).toThrow(/minute/);
  });
});
