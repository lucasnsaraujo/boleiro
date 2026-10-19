import { describe, expect, it } from "vitest";
import { loadWorldPack, parseWorldPack } from "./worldPack.js";

describe("a country's world pack", () => {
  const argentina = loadWorldPack("ar");

  it("reads the country's leagues top level first", () => {
    expect(argentina.country).toEqual({ id: "ar", name: "Argentina" });
    expect(argentina.leagues.map((league) => [league.id, league.tier])).toEqual([
      ["ar-1", 1],
      ["ar-2", 2],
    ]);
  });

  it("reads each club with its league, colours and squad", () => {
    const river = argentina.clubs.find((club) => club.name === "CA River Plate");
    expect(river).toMatchObject({ league: "ar-1", colours: { primary: "#FFFFFF", secondary: "#FF0000" } });
    const squad = argentina.players.filter((player) => player.clubId === river?.id);
    expect(squad.length).toBeGreaterThanOrEqual(18);
    expect(squad.some((player) => player.group === "GK")).toBe(true);
    expect(squad.every((player) => player.marketValueEur === null || player.marketValueEur > 0)).toBe(true);
  });

  it("reads each player's citizenships as Transfermarkt lists them, the first his own", () => {
    const england = loadWorldPack("gb-eng");
    const citizenshipsOf = (name: string) => england.players.find((player) => player.name === name)?.nationalities;
    expect(citizenshipsOf("David Raya")).toEqual(["Spain"]);
    expect(citizenshipsOf("Bukayo Saka")).toEqual(["England", "Nigeria"]);
    expect(england.players.filter((player) => player.nationalities.length === 0)).toEqual([]);
  });

  it("rejects a pack whose players point at a club it does not have", () => {
    const pack = {
      format: 1,
      packVersion: "xx-1",
      country: { id: "xx", name: "X" },
      competitions: { id: ["xx-1"], name: ["Liga"], kind: ["league"], tier: [1] },
      clubs: { id: ["a"], name: ["A"], shortName: ["A"], league: ["xx-1"], primaryColour: ["#000000"], secondaryColour: ["#FFFFFF"] },
      players: { club: [3], name: ["P"], group: ["GK"], age: [20], marketValueEur: [null] },
    };
    expect(() => parseWorldPack(JSON.stringify(pack))).toThrow(/club/);
  });
});
