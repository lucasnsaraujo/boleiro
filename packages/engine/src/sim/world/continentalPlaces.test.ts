import { describe, expect, it } from "vitest";
import { continentalPlaces, type ContinentalSlot } from "./continentalPlaces.js";

const table = Array.from({ length: 20 }, (_, i) => `club${i + 1}`);

describe("continentalPlaces", () => {
  it("fills league places down the final table", () => {
    const slots: ContinentalSlot<"champions" | "europa">[] = [
      { entry: "champions", from: "league", places: 2 },
      { entry: "europa", from: "league", places: 1 },
    ];
    expect(Object.fromEntries(continentalPlaces(slots, table, null))).toEqual({ champions: ["club1", "club2"], europa: ["club3"] });
  });

  it("gives cup finalists their places first, and their league places pass down the table", () => {
    const slots: ContinentalSlot<"champions" | "europa">[] = [
      { entry: "champions", from: "league", places: 2 },
      { entry: "europa", from: "cupChampion" },
      { entry: "europa", from: "league", places: 1 },
    ];
    const places = continentalPlaces(slots, table, { championId: "club2", runnerUpId: "club9" });
    expect(Object.fromEntries(places)).toEqual({ champions: ["club1", "club3"], europa: ["club2", "club4"] });
  });

  it("leaves a cup place empty when there is no cup final", () => {
    const places = continentalPlaces([{ entry: "cup", from: "cupRunnerUp" }], table, null);
    expect(places.get("cup")).toEqual([]);
  });
});
