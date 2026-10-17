import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { randomStream } from "../../engine/random.js";
import { loadNewGame } from "../loadNewGame.js";
import { fifaWindowsOf } from "./fifaCalendar.js";
import { competitionsOf, COPA_AMERICA_2028_HOST, throughNow, WORLD_CUP_2030_SIZE, type DrawSource } from "./nationalCompetitions.js";

const game = loadNewGame(2, { coachClubId: null, nationalFootball: loadNationalFootball() });
const teams = game.nations?.teams ?? {};
const source: DrawSource = { teams, competitions: {}, matches: [] };
const random = () => randomStream(7).next;
const inWindow = (date: string) => [2027, 2028, 2029].some((season) => fifaWindowsOf(season).some((w) => date >= w.from && date <= w.until));

describe("the national competitions of the 2030 cycle", () => {
  it("open CONMEBOL's qualifiers the year after the World Cup: ten teams home and away, on window days over three years", () => {
    const opened = competitionsOf(2027, source, random());
    const qualifiers = opened.competitions.find((c) => c.id === "qualifiers-conmebol-2030");
    expect(qualifiers?.groups.A).toHaveLength(10);
    const matches = opened.matches.filter((m) => m.competitionId === "qualifiers-conmebol-2030");
    expect(matches).toHaveLength(90);
    expect(new Set(matches.map((m) => m.date)).size).toBe(18);
    expect(matches.every((m) => inWindow(m.date))).toBe(true);
    expect(matches.at(-1)?.date.slice(0, 4)).toBe("2029");
  });

  it("hold the Copa América and the Euro in 2028, the Copa with its host in group A and six CONCACAF guests", () => {
    const opened = competitionsOf(2028, source, random());
    const copa = opened.competitions.find((c) => c.id === "copa-america-2028");
    expect(Object.values(copa?.groups ?? {}).flat()).toHaveLength(16);
    expect(copa?.groups.A?.[0]).toBe(COPA_AMERICA_2028_HOST);
    expect(Object.values(copa?.groups ?? {}).flat().filter((id) => teams[id]?.confederation === "CONCACAF")).toHaveLength(6);
    const euro = opened.competitions.find((c) => c.id === "euro-2028");
    expect(Object.values(euro?.groups ?? {}).flat()).toHaveLength(24);
    expect(opened.matches.filter((m) => m.competitionId === "euro-2028").every((m) => m.date >= "2028-06-09" && m.date <= "2028-07-09")).toBe(true);
  });

  it("play UEFA's qualifiers in 2029 without the hosts Spain and Portugal", () => {
    const opened = competitionsOf(2029, source, random());
    const qualifiers = opened.competitions.find((c) => c.id === "qualifiers-uefa-2030");
    const entrants = Object.values(qualifiers?.groups ?? {}).flat();
    expect(entrants).not.toContain("spain");
    expect(entrants).not.toContain("portugal");
    expect(Object.values(qualifiers?.groups ?? {}).every((ids) => ids.length === 4)).toBe(true);
  });

  it("draw the 2030 World Cup's field with its six hosts, on 8 June to 21 July", () => {
    const opened = competitionsOf(2030, source, random());
    const worldCup = opened.competitions.find((c) => c.id === "world-cup-2030");
    const field = Object.values(worldCup?.groups ?? {}).flat();
    expect(field).toHaveLength(WORLD_CUP_2030_SIZE);
    expect(field).toEqual(expect.arrayContaining(["spain", "portugal", "morocco", "argentina", "uruguay", "paraguay"]));
    expect(worldCup?.until).toBe("2030-07-21");
    expect(opened.matches.filter((m) => m.competitionId === "world-cup-2030").every((m) => m.date >= "2030-06-08")).toBe(true);
  });

  it("open a Nations League League A every even year after 2026", () => {
    expect(competitionsOf(2028, source, random()).competitions.some((c) => c.id === "nations-league-2028")).toBe(true);
    expect(competitionsOf(2027, source, random()).competitions.some((c) => c.kind === "nations-league")).toBe(false);
  });
});

describe("who a competition sends through as its tables stand", () => {
  it("takes CONMEBOL's six World Cup places from the qualifiers: its three 2030 hosts, in already, and the best three others", () => {
    const opened = competitionsOf(2027, source, random());
    const qualifiers = opened.competitions.find((c) => c.id === "qualifiers-conmebol-2030");
    const through = qualifiers ? throughNow(qualifiers, { ...source, matches: opened.matches }) : new Set<string>();
    expect(through.size).toBe(6);
    for (const host of ["argentina", "uruguay", "paraguay"]) expect(through.has(host)).toBe(true);
  });

  it("takes a 48-team World Cup's top two of each group and its eight best thirds", () => {
    const worldCup = game.nations?.competitions["world-cup-2026"];
    const through = worldCup && game.nations ? throughNow(worldCup, game.nations) : new Set<string>();
    expect(through.size).toBe(32);
  });
});
