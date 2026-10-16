import { REFEREE_ROSTER } from "@boleiro/data/refereeRoster";
import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import { seededRandom } from "../../engine/random.js";
import { CARD_RATES } from "../discipline/cardRates.js";
import { drawCards } from "../discipline/drawCards.js";
import type { Competition, Fixture, SimPlayer, Stage } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { matchOfficials, refereedCardRates, type MatchOfficials } from "./matchOfficials.js";

const base = { id: "c", season: 2026, clubIds: [], stageDates: [], drawOrder: [] };
const league = (division: "A" | "B" | "C" | "D", stages: Stage[] = []): Competition => ({ ...base, stages, kind: "league", format: `serie-${division.toLowerCase() as Lowercase<typeof division>}`, division });
const fixture = (stage: number, id = "f1"): Fixture => ({ id, competitionId: "c", stage, date: "2026-05-01", homeId: "h", awayId: "a", result: null });
const knockout = (ties: number): Stage => ({ kind: "knockout", ties: Array.from({ length: ties }, (): [string, string] => ["h", "a"]), dates: [] });
const groups: Stage = { kind: "groups", groups: [["h", "a"]], legs: 2, dates: [] };

describe("a match's officials", () => {
  it("brings VAR only where the competition has it at the match's stage", () => {
    expect(matchOfficials(1, league("A"), fixture(0)).var).toBe("brazil");
    expect(matchOfficials(1, league("B"), fixture(0)).var).toBe("brazil");
    expect(matchOfficials(1, league("C"), fixture(0)).var).toBeNull();
    expect(matchOfficials(1, league("C"), fixture(1)).var).toBe("brazil");
    expect(matchOfficials(1, league("D", [groups, knockout(32), knockout(16)]), fixture(2)).var).toBeNull();
    expect(matchOfficials(1, league("D", [groups, knockout(32), knockout(16), knockout(8)]), fixture(3)).var).toBe("brazil");
    const cup: Competition = { ...base, stages: [], kind: "cup", entries: [] };
    expect(matchOfficials(1, cup, fixture(0)).var).toBeNull();
    expect(matchOfficials(1, cup, fixture(4)).var).toBe("brazil");
    expect(matchOfficials(1, { ...base, stages: [], kind: "state", state: "AC" }, fixture(0)).var).toBeNull();
    expect(matchOfficials(1, { ...base, stages: [], kind: "state", state: "RS" }, fixture(0)).var).toBe("brazil");
    const abroad = (country: string, level: number): Competition => ({
      ...base,
      stages: [],
      kind: "league",
      division: null,
      format: "round-robin",
      abroad: { country, level, name: "x", promoted: 0, relegated: 0 },
    });
    expect(matchOfficials(1, abroad("gb-eng", 0), fixture(0)).var).toBe("europe");
    expect(matchOfficials(1, abroad("gb-eng", 1), fixture(0)).var).toBeNull();
  });

  it("names a real referee of the competition, the same one for the same seed, and none where the data has none", () => {
    const names = new Set(REFEREE_ROSTER["br-A"]?.map((r) => r.name));
    const fixtures = Array.from({ length: 200 }, (_, i) => fixture(0, `f${i}`));
    const picked = fixtures.map((f) => matchOfficials(7, league("A"), f).referee?.name);
    expect(picked.every((name) => name !== undefined && names.has(name))).toBe(true);
    expect(fixtures.map((f) => matchOfficials(7, league("A"), f).referee?.name)).toEqual(picked);
    expect(new Set(picked).size).toBeGreaterThan(1);
    expect(matchOfficials(7, { ...base, stages: [], kind: "state", state: "AC" }, fixture(0)).referee).toBeNull();
  });

  it("makes the competition's referees, as often as each one referees, as strict as its real card rates on average", () => {
    const fixtures = Array.from({ length: 4000 }, (_, i) => fixture(0, `f${i}`));
    const mean = fixtures.reduce((sum, f) => sum + matchOfficials(3, league("A"), f).strictness, 0) / fixtures.length;
    expect(REFEREE_ROSTER["br-A"]?.length).toBeGreaterThan(1);
    expect(mean).toBeGreaterThan(0.97);
    expect(mean).toBeLessThan(1.03);
  });

  it("has a strict referee book more players than a lenient one", () => {
    const officials = Array.from({ length: 400 }, (_, i) => matchOfficials(5, league("A"), fixture(0, `f${i}`)));
    const strictest = officials.reduce((a, b) => (b.strictness > a.strictness ? b : a));
    const mildest = officials.reduce((a, b) => (b.strictness < a.strictness ? b : a));
    expect(strictest.strictness).toBeGreaterThan(1);
    expect(mildest.strictness).toBeLessThan(1);
    const player = (id: string, clubId: string, group: PositionGroup): SimPlayer => ({
      id, name: id, group, strength: 70, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
    });
    const eleven = (clubId: string) => Array.from({ length: 11 }, (_, i) => player(`${clubId}-${i}`, clubId, i === 0 ? "GK" : "DEF"));
    const cards = (refereed: MatchOfficials) => {
      const random = seededRandom(11);
      const rates = refereedCardRates(CARD_RATES.A, refereed);
      let count = 0;
      for (let i = 0; i < 3000; i++) count += drawCards(eleven("h"), eleven("a"), rates, random).length;
      return count / 3000;
    };
    expect(cards(strictest)).toBeGreaterThan(cards(mildest) * (strictest.strictness / mildest.strictness) * 0.85);
    expect(cards({ referee: null, strictness: 1, var: null })).toBeGreaterThan(cards(mildest));
  });
});
