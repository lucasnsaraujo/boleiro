import { loadWorldPack } from "@boleiro/data/worldPack";
import { describe, expect, it } from "vitest";
import { EUROPE } from "../world/europe.js";
import { GUEST_COUNTRIES } from "../world/guests.js";
import { MARKET_LEAGUES } from "../world/marketLeagues.js";
import { SOUTH_AMERICA } from "../world/southAmerica.js";
import { homeNationalityOf, homeNationalityOfCountry, isForeignTo } from "./homeNationality.js";

describe("a country's own citizenship", () => {
  const countries = [...EUROPE, ...SOUTH_AMERICA, ...MARKET_LEAGUES].map((structure) => structure.id).concat(GUEST_COUNTRIES);

  it("is the one most of its pack's players hold first", () => {
    for (const id of countries) {
      const counts = new Map<string, number>();
      for (const { nationalities } of loadWorldPack(id).players) if (nationalities[0]) counts.set(nationalities[0], (counts.get(nationalities[0]) ?? 0) + 1);
      const [most] = [...counts].sort((a, b) => b[1] - a[1]);
      expect([id, homeNationalityOfCountry(id)]).toEqual([id, most?.[0]]);
    }
  });

  it("is Brazil's for a Brazilian club and its league's for a club abroad", () => {
    expect(homeNationalityOf({})).toBe("Brazil");
    expect(homeNationalityOf({ abroad: { country: "gb-eng", level: 0 } })).toBe("England");
  });

  it("makes a player foreign only when he holds none of it, and one with none known never", () => {
    expect(isForeignTo(["England", "Nigeria"], "England")).toBe(false);
    expect(isForeignTo(["Spain"], "England")).toBe(true);
    expect(isForeignTo(["Brazil", "Spain"])).toBe(false);
    expect(isForeignTo([], "England")).toBe(false);
  });
});
