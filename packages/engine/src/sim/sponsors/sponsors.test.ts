import { describe, expect, it } from "vitest";
import type { Brand, ShirtDeal } from "@boleiro/data/sponsors";
import { loadNewGame } from "../loadNewGame.js";
import { seedSponsors, type SponsorFiles } from "./sponsors.js";

const MI = 1_000_000;

const brand = (id: string, sector = "", size: Brand["size"] = null, isPool = false): Brand => ({ id, name: id.toUpperCase(), sector, size, isPool });
const deal = (clubId: string, slot: ShirtDeal["slot"], brandId: string, yearly: number | null = null, untilSeason: number | null = null): ShirtDeal => ({
  clubId,
  slot,
  rank: 0,
  brandId,
  yearly,
  untilSeason,
  valueSource: yearly ? "https://press.example/deal" : "",
  source: "https://pt.wikipedia.org/w/index.php?oldid=1",
});

const POOL: Brand[] = [
  brand("bigbank", "bank", "giant", true),
  brand("midbank", "bank", "medium", true),
  brand("smallshop", "retail", "small", true),
  brand("localbet", "betting", "small", true),
  brand("kitco", "kit", "medium", true),
  brand("tinykit", "kit", "small", true),
];

function seeded(files: SponsorFiles, seed = 7) {
  const game = loadNewGame(seed, { coachClubId: null });
  return { game, seeded: seedSponsors(game, files) };
}

describe("a new game's shirt sponsors", () => {
  const files: SponsorFiles = {
    brands: [...POOL, brand("betano", "betting"), brand("adidas", "kit"), brand("hapvida"), brand("ademicon")],
    deals: [deal("flamengo-rj", "master", "betano", 268.5 * MI, 2028), deal("flamengo-rj", "kit", "adidas", 70 * MI, 2029), deal("flamengo-rj", "back", "hapvida"), deal("flamengo-rj", "front", "ademicon")],
  };

  it("puts a club's real sponsors on its shirt, with the press's values and ends where reported", () => {
    const { seeded: sponsors } = seeded(files);
    const flamengo = sponsors.sponsors["flamengo-rj"];
    expect(flamengo?.contracts.find((c) => c.slot === "master")).toMatchObject({ brandId: "betano", yearly: 268.5 * MI, untilSeason: 2028, basis: "press", isBetting: true, isEndKnown: true });
    expect(flamengo?.contracts.find((c) => c.slot === "kit")).toMatchObject({ brandId: "adidas", yearly: 70 * MI, basis: "press" });
  });

  it("estimates the values the press didn't report from the club's sponsorship, keeping every deal inside it", () => {
    const { game, seeded: sponsors } = seeded(files);
    const contracts = sponsors.sponsors["flamengo-rj"]?.contracts ?? [];
    const back = contracts.find((c) => c.slot === "back");
    expect(back).toMatchObject({ brandId: "hapvida", basis: "estimate", isEndKnown: false });
    expect(back?.yearly).toBeGreaterThan(0);
    expect(contracts.reduce((sum, c) => sum + c.yearly, 0)).toBeLessThanOrEqual(game.finances["flamengo-rj"]?.sponsorship ?? 0);
  });

  it("scales the press's values down to the club's sponsorship when they don't fit, and calls them estimates", () => {
    const { game, seeded: sponsors } = seeded({ ...files, deals: [deal("mirassol-sp", "master", "betano", 900 * MI, 2028)] });
    const master = sponsors.sponsors["mirassol-sp"]?.contracts.find((c) => c.slot === "master");
    expect(master?.basis).toBe("estimate");
    expect(master?.yearly).toBeLessThan(game.finances["mirassol-sp"]?.sponsorship ?? 0);
  });

  it("gives a club the data has no sponsors for a master and a kit maker from the pool, as deals of the game", () => {
    const { seeded: sponsors } = seeded(files);
    const contracts = sponsors.sponsors["mirassol-sp"]?.contracts ?? [];
    expect(contracts.map((c) => c.slot).sort()).toEqual(["kit", "master"]);
    for (const contract of contracts) {
      expect(contract.basis).toBe("game");
      expect(POOL.map((b) => b.id)).toContain(contract.brandId);
    }
    expect(POOL.find((b) => b.id === contracts.find((c) => c.slot === "kit")?.brandId)?.sector).toBe("kit");
  });

  it("seeds every club with money and the same deals from the same seed", () => {
    const { game, seeded: first } = seeded(files);
    expect(Object.keys(first.sponsors).sort()).toEqual(Object.keys(game.finances).sort());
    expect(seeded(files).seeded).toStrictEqual(first);
  });

  it("keeps the offer pool with the game, so a new pack doesn't change a running career", () => {
    const { seeded: sponsors } = seeded(files);
    expect(sponsors.pool.map((b) => b.id)).toEqual(POOL.map((b) => b.id));
  });
});
