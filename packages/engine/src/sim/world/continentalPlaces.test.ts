import { describe, expect, it } from "vitest";
import { BRAZIL } from "./brazil.js";
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

  it("keeps a cup winner in the better place it earned in the league, its cup place passing down the table", () => {
    const slots: ContinentalSlot<"champions" | "europa">[] = [
      { entry: "champions", from: "league", places: 2 },
      { entry: "europa", from: "cupChampion" },
      { entry: "europa", from: "league", places: 1 },
    ];
    const places = continentalPlaces(slots, table, { championId: "club2", runnerUpId: "club9" });
    expect(Object.fromEntries(places)).toEqual({ champions: ["club1", "club2"], europa: ["club3", "club4"] });
  });

  it("leaves a cup place empty when there is no cup final", () => {
    const places = continentalPlaces([{ entry: "cup", from: "cupRunnerUp" }], table, null);
    expect(places.get("cup")).toEqual([]);
  });

  it("keeps the league champion in the Libertadores groups when it loses the Copa do Brasil final, his preliminary place passing down the table", () => {
    const places = continentalPlaces(BRAZIL.continental, table, { championId: "club9", runnerUpId: "club1" });
    expect(Object.fromEntries(places)).toEqual({
      libertadoresGroups: ["club9", "club1", "club2", "club3", "club4"],
      libertadoresPreliminary: ["club5", "club6"],
      sulAmericana: ["club7", "club8", "club10", "club11", "club12", "club13"],
    });
  });

  it("hands the league champion's group place down the table when it also wins the Copa do Brasil", () => {
    const places = continentalPlaces(BRAZIL.continental, table, { championId: "club1", runnerUpId: "club9" });
    expect(Object.fromEntries(places)).toEqual({
      libertadoresGroups: ["club1", "club2", "club3", "club4", "club5"],
      libertadoresPreliminary: ["club9", "club6"],
      sulAmericana: ["club7", "club8", "club10", "club11", "club12", "club13"],
    });
  });
});
