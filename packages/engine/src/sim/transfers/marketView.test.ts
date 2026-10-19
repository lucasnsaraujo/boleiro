import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { marketView } from "./marketView.js";
import { squadNeeds } from "./squadNeeds.js";
import { wageDemand } from "./wageDemand.js";

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

describe("a market view's plans", () => {
  const santos = "santos-sp";
  const [joining] = Object.values(start.players).filter((p) => p.clubId === "flamengo-rj");
  if (!joining) throw new Error("Flamengo has no players");

  it("count the players joining a club on pre-contracts and leave out those leaving it, in its needs and wage bill", () => {
    const [leaving] = marketView(start).squad(santos);
    if (!leaving) throw new Error("Santos has no players");
    const view = marketView({ ...start, market: { ...start.market, preContracts: { [leaving.id]: "palmeiras-sp", [joining.id]: santos } } });
    const squad = view.squad(santos);
    expect(view.plannedNeeds(santos)).toEqual(squadNeeds([...squad.filter((p) => p.id !== leaving.id), joining], view.tier(santos)));
    expect(view.plannedBill(santos)).toBe(view.bill(santos) - leaving.wage + wageDemand(joining, squad));
    expect(view.needs(santos)).toEqual(squadNeeds(squad, view.tier(santos)));
  });

  it("follow a pre-contract the view records, counted once", () => {
    const view = marketView(start);
    view.recordPreContract(joining, santos, 1000);
    view.recordPreContract(joining, santos, 1000);
    expect(view.plannedNeeds(santos)).toEqual(squadNeeds([...view.squad(santos), joining], view.tier(santos)));
    expect(view.plannedBill(santos)).toBe(view.bill(santos) + 1000);
    expect(view.plannedBill("flamengo-rj")).toBe(view.bill("flamengo-rj") - joining.wage);
  });
});
