import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { neutralVenue } from "../continental/neutralGrounds.js";
import { loadNewGame } from "../loadNewGame.js";
import { nationalFixtureOf } from "../nations/nationalFixtures.js";
import { openNations } from "../nations/openNations.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { hostsThrough, withHosts } from "./drawHosts.js";

const football = loadNationalFootball();
const start = loadNewGame(5, { coachClubId: "flamengo-rj", world: loadSouthAmerica(2026), nationalFootball: football });

describe("the hosts a game keeps", () => {
  it("are on a new game's save, every edition chosen by then, and the season's cups play at theirs", () => {
    expect(start.hosts?.["world-cup-2034"]?.countries).toEqual(["saudi-arabia"]);
    expect(start.hosts?.["libertadores-2027"]).toBeDefined();
    const libertadores = start.competitions["libertadores-2026"];
    expect(libertadores?.kind === "continental" && libertadores.host).toEqual(start.hosts?.["libertadores-2026"]);
  });

  it("are given to a game saved before hosts when it loads, as a new game of its seed would have drawn them", () => {
    const saved = { ...start };
    delete saved.hosts;
    expect(withHosts(saved).hosts).toEqual(start.hosts);
    expect(withHosts(start)).toBe(start);
  });

  it("open a later World Cup and Euro with the hosts the game kept, as automatic entrants", () => {
    const hosts = hostsThrough(start.hosts ?? {}, start.seed, 2034);
    const in2032 = openNations(football, { ...start, hosts }, 2032, start.seed);
    expect(in2032.competitions["euro-2032"]?.host).toBe("italy");
    expect(Object.values(in2032.competitions["euro-2032"]?.groups ?? {}).flat()).toEqual(expect.arrayContaining(["italy", "turkiye"]));
    const in2034 = openNations(football, { ...start, hosts }, 2034, start.seed);
    expect(in2034.competitions["world-cup-2034"]?.host).toBe("saudi-arabia");
    expect(in2034.competitions["world-cup-2034"]?.groups.A?.[0]).toBe("saudi-arabia");
  });

  it("put a national team's World Cup match at one of its hosts' grounds", () => {
    const match = start.nations?.matches.find((m) => m.competitionId === "world-cup-2026" && m.round === "group");
    if (!match) throw new Error("no 2026 World Cup group match");
    const found = nationalFixtureOf(start, match.id);
    expect(found?.competition.host?.final.name).toBe("MetLife Stadium");
    const venue = found && neutralVenue(found.competition, found.fixture);
    expect(found?.competition.host?.grounds.map((ground) => ground.name)).toContain(venue?.name);
  });
});
