import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { incidentHandling } from "./incidentHandling.js";

describe("who answers a red card or an injury in a match", () => {
  const state = loadNewGame(1, { coachClubId: "flamengo-rj" });

  it("asks the human coach of the club in a window", () => {
    expect(incidentHandling(state, "flamengo-rj")).toBe("askCoach");
  });

  it("leaves a CPU club to its AI coach's substitutions", () => {
    expect(incidentHandling(state, "palmeiras-sp")).toBe("aiSubstitutions");
    expect(incidentHandling(loadNewGame(1, { coachClubId: null }), "flamengo-rj")).toBe("aiSubstitutions");
  });

  it("asks a hot-seat coach waiting for his turn as well as the one in the seat", () => {
    const twoCoaches = loadNewGame(1, { coachClubId: "flamengo-rj", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] } });
    expect(incidentHandling(twoCoaches, "palmeiras-sp")).toBe("askCoach");
    expect(incidentHandling(twoCoaches, "flamengo-rj")).toBe("askCoach");
    expect(incidentHandling(twoCoaches, "santos-sp")).toBe("aiSubstitutions");
  });
});
