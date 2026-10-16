import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { marketView } from "./marketView.js";
import { squadNeeds } from "./squadNeeds.js";

const start = loadNewGame(5, { coachClubId: null });

describe("a market view's squad needs", () => {
  it("are the squad's needs as squadNeeds works them out", () => {
    const view = marketView(start);
    expect(view.needs("santos-sp")).toEqual(squadNeeds(view.squad("santos-sp"), view.tier("santos-sp")));
  });

  it("follow a move the view records", () => {
    const view = marketView(start);
    const leaving = view.needs("santos-sp").weakest;
    if (!leaving) throw new Error("Santos has no eleven");
    view.record(leaving, null);
    expect(view.needs("santos-sp").weakest).not.toBe(leaving);
    expect(view.needs("santos-sp")).toEqual(squadNeeds(view.squad("santos-sp"), view.tier("santos-sp")));
  });
});
