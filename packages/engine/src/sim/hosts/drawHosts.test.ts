import { describe, expect, it } from "vitest";
import { ANNOUNCED_HOSTS } from "./announcedHosts.js";
import { BIG_STADIUMS } from "./bigStadiums.js";
import { hostsThrough, isEditionSeason } from "./drawHosts.js";
import { HOSTED_CUPS, type EditionHost, type HostedCup, type Hosts } from "./venue.js";

const SEEDS = [1, 7, 13, 42, 99];
const UNTIL = 2066;
const hostsOf = (seed: number): Hosts => hostsThrough({}, seed, UNTIL);
const editions = (hosts: Hosts, cup: HostedCup): [number, EditionHost][] =>
  Array.from({ length: UNTIL - 2026 + 1 }, (_, i) => 2026 + i)
    .filter((season) => isEditionSeason(cup, season))
    .map((season): [number, EditionHost] => {
      const host = hosts[`${cup}-${season}`];
      if (!host) throw new Error(`no host for ${cup}-${season}`);
      return [season, host];
    });
const CONMEBOL = new Set(["argentina", "bolivia", "brazil", "chile", "colombia", "ecuador", "paraguay", "peru", "uruguay", "venezuela"]);
const CONFEDERATION: Record<string, string> = {
  "united-states": "CONCACAF", canada: "CONCACAF", mexico: "CONCACAF", morocco: "CAF", egypt: "CAF", "south-africa": "CAF",
  "saudi-arabia": "AFC", qatar: "AFC", china: "AFC", japan: "AFC", "south-korea": "AFC", australia: "AFC", "new-zealand": "OFC",
  ...Object.fromEntries([...CONMEBOL].map((country) => [country, "CONMEBOL"])),
};
const confederationOf = (country: string) => CONFEDERATION[country] ?? "UEFA";

describe("hosts of every edition", () => {
  const hosts = hostsOf(7);

  it("give every edition of every hosted cup through 2066 a final among its grounds, in its host countries", () => {
    for (const cup of HOSTED_CUPS) {
      for (const [, host] of editions(hosts, cup)) {
        expect(host.grounds[0]).toEqual(host.final);
        expect(host.countries).toContain(host.final.country);
        expect(host.grounds.every((ground) => host.countries.includes(ground.country))).toBe(true);
      }
    }
  });

  it("keep the hosts and grounds organisers have announced", () => {
    expect(hosts["world-cup-2026"]?.final.name).toBe("MetLife Stadium");
    expect(hosts["world-cup-2026"]?.grounds).toHaveLength(16);
    expect(hosts["world-cup-2030"]?.countries).toEqual(["spain", "portugal", "morocco", "argentina", "uruguay", "paraguay"]);
    expect(hosts["world-cup-2034"]?.final.name).toBe("King Salman International Stadium");
    expect(hosts["euro-2028"]?.final.name).toBe("Wembley Stadium");
    expect(hosts["euro-2032"]?.countries).toEqual(["italy", "turkiye"]);
    expect(hosts["libertadores-2026"]?.final).toMatchObject({ name: "Estadio Centenario", city: "Montevidéu" });
    expect(hosts["sul-americana-2026"]?.final.name).toBe("Estadio Metropolitano Roberto Meléndez");
    expect(hosts["sul-americana-2027"]?.countries).toEqual(["bolivia"]);
    expect(hosts["champions-league-2026"]?.final.name).toBe("Estádio Metropolitano");
    expect(hosts["uefa-super-cup-2028"]?.final.city).toBe("Astana");
  });

  it("draw an announced World Cup's or Euro's missing final among its hosts' grounds big enough for one", () => {
    expect(["Camp Nou", "Estadio Santiago Bernabéu"]).toContain(hosts["world-cup-2030"]?.final.name);
    expect(["italy", "turkiye"]).toContain(hosts["euro-2032"]?.final.country);
    expect(hosts["euro-2032"]?.final.capacity).toBeGreaterThanOrEqual(60_000);
  });

  it("draw the same hosts from the same seed and other hosts from other seeds", () => {
    expect(hostsOf(7)).toEqual(hosts);
    const drawn = (seed: number) => JSON.stringify(Object.fromEntries(Object.entries(hostsOf(seed)).map(([id, host]) => [id, host.final.name])));
    expect(new Set(SEEDS.map(drawn)).size).toBe(SEEDS.length);
  });
});

describe("the real rules behind drawn hosts", () => {
  const all = SEEDS.map(hostsOf);

  it("never give a World Cup to a confederation that hosted either of the two before, and seat its final for about 80,000", () => {
    for (const hosts of all) {
      const cups = editions(hosts, "world-cup");
      cups.forEach(([season, host], i) => {
        if (season <= 2034) return;
        const recent = new Set(cups.slice(Math.max(0, i - 2), i).flatMap(([, before]) => before.countries.map(confederationOf)));
        expect(host.countries.map(confederationOf).filter((confederation) => recent.has(confederation))).toEqual([]);
        expect(host.final.capacity).toBeGreaterThanOrEqual(76_000);
        expect(host.grounds.length).toBeGreaterThanOrEqual(4);
      });
    }
  });

  it("never give a Euro to a host of either of the two before, with a final of 60,000", () => {
    for (const hosts of all) {
      const euros = editions(hosts, "euro");
      euros.forEach(([season, host], i) => {
        if (season <= 2032) return;
        const recent = euros.slice(i - 2, i).flatMap(([, before]) => before.countries);
        expect(host.countries.filter((country) => recent.includes(country))).toEqual([]);
        expect(host.final.capacity).toBeGreaterThanOrEqual(60_000);
        expect(confederationOf(host.final.country)).toBe("UEFA");
      });
    }
  });

  it("turn the Copa América to the CONMEBOL member longest without one, Ecuador first", () => {
    for (const hosts of all) {
      const copas = editions(hosts, "copa-america");
      expect(copas[0]?.[1].countries).toEqual(["ecuador"]);
      expect(copas.slice(0, 3).map(([, host]) => host.countries[0])).toEqual(["ecuador", "uruguay", "bolivia"]);
      expect(copas.every(([, host]) => CONMEBOL.has(host.countries[0] ?? ""))).toBe(true);
    }
  });

  it("never give a Club World Cup to the confederation of the one before", () => {
    for (const hosts of all) {
      const cups = editions(hosts, "club-world-cup");
      const countriesBefore = [["united-states"], ...cups.map(([, host]) => host.countries)];
      cups.forEach(([, host], i) => {
        const before = new Set(countriesBefore[i]?.map(confederationOf));
        expect(host.countries.map(confederationOf).filter((confederation) => before.has(confederation))).toEqual([]);
        expect(host.final.capacity).toBeGreaterThanOrEqual(60_000);
      });
    }
  });

  it("play CONMEBOL's finals in a member's big ground, never in the country of the cup's last final or of the season's other final", () => {
    for (const hosts of all) {
      for (const cup of ["libertadores", "sul-americana"] as const) {
        const finals = editions(hosts, cup);
        finals.forEach(([season, host], i) => {
          expect(CONMEBOL.has(host.final.country)).toBe(true);
          if (season <= 2027) return;
          expect(host.final.capacity).toBeGreaterThanOrEqual(40_000);
          expect(host.final.country).not.toBe(finals[i - 1]?.[1].final.country);
        });
      }
      for (let season = 2027; season <= UNTIL; season++) {
        expect(hosts[`libertadores-${season}`]?.final.country).not.toBe(hosts[`sul-americana-${season}`]?.final.country);
      }
    }
  });

  it("play UEFA's finals in members' big grounds of different countries each season, the Champions League's for 60,000", () => {
    for (const hosts of all) {
      for (let season = 2029; season <= UNTIL; season++) {
        const finals = (["champions-league", "europa-league", "uefa-super-cup"] as const).map((cup) => hosts[`${cup}-${season}`]?.final);
        expect(new Set(finals.map((final) => final?.country)).size).toBe(3);
        expect(finals.every((final) => final !== undefined && confederationOf(final.country) === "UEFA" && final.country !== "russia")).toBe(true);
        expect(finals[0]?.capacity).toBeGreaterThanOrEqual(60_000);
        for (const cup of ["champions-league", "europa-league", "uefa-super-cup"] as const) {
          const before = [1, 2].map((back) => hosts[`${cup}-${season - back}`]?.final.country);
          expect(before).not.toContain(hosts[`${cup}-${season}`]?.final.country);
        }
      }
    }
  });

  it("name only real grounds, from the list of big stadiums or an organiser's announcement", () => {
    const announced = Object.values(ANNOUNCED_HOSTS).flatMap((host) => [...(host.grounds ?? []), ...(host.final ? [host.final] : [])]);
    const real = new Set([...BIG_STADIUMS, ...announced].map((ground) => ground.name));
    for (const hosts of all) {
      expect(Object.values(hosts).flatMap((host) => host.grounds).filter((ground) => !real.has(ground.name))).toEqual([]);
    }
  });
});

describe("hosts kept on the save", () => {
  it("add only the editions an organiser would have chosen by then and keep every one already there", () => {
    const at2026 = hostsThrough({}, 7, 2026);
    expect(Object.keys(at2026)).toContain("world-cup-2034");
    expect(Object.keys(at2026)).not.toContain("world-cup-2038");
    expect(Object.keys(at2026)).toContain("libertadores-2027");
    expect(Object.keys(at2026)).not.toContain("libertadores-2028");
    const kept = { ...at2026, "libertadores-2027": { countries: ["brazil"], final: BIG_STADIUMS[0], grounds: [BIG_STADIUMS[0]] } } as Hosts;
    const later = hostsThrough(kept, 7, 2027);
    expect(later["libertadores-2027"]).toBe(kept["libertadores-2027"]);
    expect(Object.keys(later)).toContain("libertadores-2028");
    expect(hostsThrough(later, 7, 2027)).toBe(later);
  });
});
