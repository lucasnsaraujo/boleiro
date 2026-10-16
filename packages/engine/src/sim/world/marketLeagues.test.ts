import { loadWorldPack } from "@boleiro/data/worldPack";
import { describe, expect, it } from "vitest";
import { MARKET_LEAGUES, marketLeaguesStart } from "./marketLeagues.js";
import { checkSquad } from "./resultOnlyLeague.js";
import { playWorldDay, startCountry } from "./resultOnlyWorld.js";
import { leagueTable } from "./resultOnlyLeague.js";
import { addDays } from "../dates.js";
import type { World } from "./world.js";

const start = marketLeaguesStart(MARKET_LEAGUES.map((structure) => loadWorldPack(structure.id)), 2026);

describe("the market leagues", () => {
  it("are Saudi Arabia's Pro League, MLS and Liga MX, one level each with every club of the data", () => {
    expect(start.map((country) => [country.structure.id, country.levels.map((level) => level.length)])).toEqual([
      ["sa", [18]],
      ["us", [30]],
      ["mx", [18]],
    ]);
    for (const club of start.flatMap((country) => country.levels.flat())) expect(() => checkSquad(club)).not.toThrow();
  });

  it("play Saudi Arabia from August to May, MLS and Liga MX over the calendar year", () => {
    const byId = Object.fromEntries(MARKET_LEAGUES.map((structure) => [structure.id, structure]));
    expect(byId.sa?.rollover).toBe("07-01");
    expect(byId.us?.rollover).toBeUndefined();
    expect(byId.mx?.rollover).toBeUndefined();
  });

  it("play MLS's conferences and play-offs and Liga MX's Apertura, Clausura and liguillas once a human coach takes a club there", () => {
    const formatOf = (id: string) => MARKET_LEAGUES.find((structure) => structure.id === id)?.levels[0]?.format;
    expect(formatOf("us")).toBe("mls");
    expect(formatOf("mx")).toBe("liga-mx");
    expect(formatOf("sa")).toBeUndefined();
  });

  it("finish a result-only season of MLS with all its matches played and a table of its 30 clubs", () => {
    const us = start.find((country) => country.structure.id === "us");
    if (!us) throw new Error("no MLS");
    let world: World = { us: startCountry(us.structure, us.levels, 2026, 5) };
    for (let date = "2026-01-01"; date < "2026-12-31"; date = addDays(date, 1)) world = playWorldDay(world, date);
    const [league] = world.us?.leagues ?? [];
    expect(league?.results.includes("-")).toBe(false);
    expect(league && leagueTable(league)).toHaveLength(30);
  });
});
