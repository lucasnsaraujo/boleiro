import { describe, expect, it } from "vitest";
import { STATES } from "@boleiro/data/clubs";
import { hostsThrough } from "@boleiro/engine/sim/hosts/drawHosts";
import { CONTINENTAL_CUPS } from "@boleiro/engine/sim/gameState";
import { EUROPE } from "@boleiro/engine/sim/world/europe";
import { MARKET_LEAGUES } from "@boleiro/engine/sim/world/marketLeagues";
import { SOUTH_AMERICA } from "@boleiro/engine/sim/world/southAmerica";
import { editionKeyOf } from "@boleiro/game-client/format/competitionEdition";
import { competitionLogoOf, logoSpecOf } from "./competitionLogos.js";
import { generatedLogoSvg } from "./generatedLogo.js";

const LEAGUES_ABROAD = [...EUROPE, ...SOUTH_AMERICA, ...MARKET_LEAGUES].flatMap((country) => country.levels.map((_, level) => `${country.id}-${level + 1}`));
const CUPS_ABROAD = EUROPE.map((country) => `${country.id}-cup`);
const BRAZIL = ["serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil", ...STATES.map((state) => `state-${state.toLowerCase()}`)];
const UEFA = ["champions-league", "europa-league", "uefa-super-cup", "nations-league"];
const NATIONAL = ["world-cup", "copa-america", "euro", "qualifiers-conmebol", "qualifiers-uefa", "friendlies"];
const hosts = hostsThrough({}, 7, 2050);
const svgOf = (url: string) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));

describe("every competition's logo", () => {
  it("resolves for every competition the game plays, in every season from 2026 to 2050", () => {
    const keys = [...BRAZIL, ...CONTINENTAL_CUPS, ...UEFA, ...LEAGUES_ABROAD, ...CUPS_ABROAD, ...NATIONAL];
    for (const key of keys) {
      for (let season = 2026; season <= 2050; season++) {
        const logo = competitionLogoOf(key, season, 48, hosts[`${key}-${season}`] ?? null);
        expect(logo.url, `${key}-${season}`).not.toBe("");
        expect(logo.height).toBeLessThanOrEqual(48);
        expect(logo.width).toBeLessThanOrEqual(Math.round(48 * 1.3));
      }
    }
  });

  it("is the real one for every league and cup abroad, the Brazilian series and cups, CONMEBOL's, FIFA's yearly cup and UEFA's", () => {
    const real = [...LEAGUES_ABROAD, ...CUPS_ABROAD, "serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil", "libertadores", "sul-americana", "recopa", "intercontinental-cup", ...UEFA];
    expect(real.filter((key) => !competitionLogoOf(key, 2031, 48).isReal)).toEqual([]);
  });

  it("uses a logo that prints its year only for that edition, and the real edition logos where there are some", () => {
    expect(competitionLogoOf("state-sp", 2026, 48).isReal).toBe(true);
    expect(competitionLogoOf("state-sp", 2027, 48).isReal).toBe(false);
    expect(competitionLogoOf("world-cup", 2026, 48).isReal).toBe(true);
    expect(competitionLogoOf("euro", 2028, 48).isReal).toBe(true);
    expect(competitionLogoOf("world-cup", 2030, 48, hosts["world-cup-2030"]).isReal).toBe(false);
  });

  it("draws a future edition in its hosts' colours and names them", () => {
    const saudi = svgOf(competitionLogoOf("world-cup", 2034, 96, hosts["world-cup-2034"]).url);
    expect(saudi).toContain("#006C35");
    expect(logoSpecOf("world-cup", 2034, hosts["world-cup-2034"]).subtitle).toBe("Arábia Saudita 2034");
    expect(logoSpecOf("copa-america", 2028, hosts["copa-america-2028"]).subtitle).toBe("Equador 2028");
    expect(logoSpecOf("euro", 2032, hosts["euro-2032"]).subtitle).toBe("Itália · Turquia");
  });

  it("draws a state championship in its state's flag with its letters, the year under its name", () => {
    const spec = logoSpecOf("state-ba", 2027);
    expect(spec).toMatchObject({ organiser: "state", motif: "shield", monogram: "BA", title: "Baiano", subtitle: "2027" });
    expect(spec.colours).toContain("#C8102E");
  });

  it("splits an id into its competition key and season", () => {
    expect(editionKeyOf("state-sp-2027")).toEqual({ key: "state-sp", season: 2027 });
    expect(editionKeyOf("gb-eng-1-2026")).toEqual({ key: "gb-eng-1", season: 2026 });
    expect(editionKeyOf("gb-eng-1")).toEqual({ key: "gb-eng-1", season: null });
  });
});

describe("a drawn logo", () => {
  const specs = [logoSpecOf("state-ac", 2027), logoSpecOf("world-cup", 2038, hosts["world-cup-2038"]), logoSpecOf("euro", 2036, hosts["euro-2036"]), logoSpecOf("copa-america", 2032, hosts["copa-america-2032"]), logoSpecOf("friendlies", 2027), logoSpecOf("qualifiers-uefa", 2030), logoSpecOf("xx-1", 2026)];

  it("is the same SVG every time it is drawn", () => {
    for (const spec of specs) expect(generatedLogoSvg(spec, "full")).toBe(generatedLogoSvg({ ...spec }, "full"));
  });

  it("is a well-formed SVG document in both layouts, each clip path defined once", () => {
    for (const spec of specs) {
      for (const layout of ["full", "mark"] as const) {
        const document = new DOMParser().parseFromString(generatedLogoSvg(spec, layout), "image/svg+xml");
        expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
        expect(document.documentElement.getAttribute("viewBox")).toBe(layout === "full" ? "0 0 200 260" : "0 0 160 160");
        const ids = [...document.querySelectorAll("clipPath")].map((clip) => clip.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const user of document.querySelectorAll("[clip-path]")) expect(ids).toContain(user.getAttribute("clip-path")?.slice(5, -1));
      }
    }
  });

  it("spells its name in outlined capitals, a path a letter", () => {
    const svg = generatedLogoSvg({ ...logoSpecOf("state-ac", 2027), monogram: undefined, kicker: "", subtitle: "", title: "Acreano" }, "full");
    const lettering = new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("g[fill] > path[transform^='translate']");
    expect(lettering).toHaveLength("ACREANO".length);
  });

  it("differs from one competition or edition to another", () => {
    const drawn = specs.map((spec) => generatedLogoSvg(spec, "full"));
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(generatedLogoSvg(logoSpecOf("state-ac", 2028), "full")).not.toBe(generatedLogoSvg(logoSpecOf("state-ac", 2027), "full"));
  });
});
