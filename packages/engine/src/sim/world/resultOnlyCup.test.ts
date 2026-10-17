import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import { cupFinal, cupMatches, openCup, playCupDay } from "./resultOnlyCup.js";
import type { WorldClub } from "./world.js";

const club = (id: string, strength: number): WorldClub => ({ id, name: id, positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => strength) });
const top = Array.from({ length: 8 }, (_, i) => `t${i}`);
const second = Array.from({ length: 6 }, (_, i) => `s${i}`);
const clubs = new Map([...top.map((id, i) => club(id, 80 - i)), ...second.map((id, i) => club(id, 60 - i))].map((c) => [c.id, c]));
const clubOf = (id: string) => clubs.get(id) ?? club(id, 50);
const leagueDates = ["2026-09-12", "2026-10-03"];
const open = () => openCup("x-cup-2026", 2026, [top, second], ["08-15", "05-23"], leagueDates, seededRandom(3));

function playAll(cup: ReturnType<typeof open>) {
  let played = cup;
  for (const date of cup.dates) played = playCupDay(played, date, clubOf, seededRandom(date.length + played.results.length));
  return played;
}

describe("a result-only national cup", () => {
  it("draws every club of the levels into a bracket, byes going to the top level's clubs", () => {
    const cup = open();
    expect(cup.bracket).toHaveLength(16);
    expect(cup.bracket.filter((id) => id !== "").toSorted()).toEqual([...top, ...second].toSorted());
    const byes = cup.bracket.flatMap((id, i) => (id === "" ? [cup.bracket[i % 2 ? i - 1 : i + 1] ?? ""] : []));
    expect(byes).toHaveLength(2);
    for (const id of byes) expect(top).toContain(id);
  });

  it("dates its rounds in order inside the season and off the league's days", () => {
    const { dates } = open();
    expect(dates).toHaveLength(4);
    expect(dates.toSorted()).toEqual(dates);
    expect((dates[0] ?? "") > "2026-08-15").toBe(true);
    expect((dates.at(-1) ?? "9") < "2027-05-23").toBe(true);
    for (const date of dates) expect(leagueDates).not.toContain(date);
  });

  it("has no final before its last round is played", () => {
    const cup = open();
    expect(cupFinal(cup)).toBeNull();
    expect(playCupDay(cup, "2026-01-01", clubOf, seededRandom(1))).toBe(cup);
  });

  it("sends each round's winners on until one club wins the final", () => {
    const cup = playAll(open());
    const final = cupFinal(cup);
    expect(final).not.toBeNull();
    const matches = cupMatches(cup);
    const last = matches.at(-1);
    expect(last && [last.homeId, last.awayId].toSorted()).toEqual([final?.championId, final?.runnerUpId].toSorted());
    for (const match of matches.filter((m) => m.homeId && m.awayId)) {
      expect(match.result).not.toBeNull();
      if (match.result && match.result.homeGoals !== match.result.awayGoals) {
        expect(match.winnerId).toBe(match.result.homeGoals > match.result.awayGoals ? match.homeId : match.awayId);
      }
    }
  });
});

describe("a result-only national cup's level matches", () => {
  const openIn = (country: string, seed: number) => openCup(`${country}-cup-2026`, 2026, [top, second], ["08-15", "05-23"], leagueDates, seededRandom(seed));
  const playWith = (cup: ReturnType<typeof open>, random: () => number) => cup.dates.reduce((played, date) => playCupDay(played, date, clubOf, random), cup);
  const SEEDS = 40;

  it("go to extra time where the country's cup plays it, and on to penalties only when still level", () => {
    let wonInExtraTime = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      for (const { result } of cupMatches(playWith(openIn("de", seed), seededRandom(seed + 100)))) {
        if (!result) continue;
        if (result.homeGoals === result.awayGoals) expect(result.isAfterExtraTime).toBe(true);
        if (result.isAfterExtraTime && result.homeGoals !== result.awayGoals) wonInExtraTime++;
      }
    }
    expect(wonInExtraTime).toBeGreaterThan(0);
  });

  it("go straight to penalties before a French cup's final, which plays extra time", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const matches = cupMatches(playWith(openIn("fr", seed), seededRandom(seed + 100)));
      const final = matches.at(-1);
      for (const { result } of matches.slice(0, -1)) expect(result?.isAfterExtraTime).toBeUndefined();
      if (final?.result?.homeGoals === final?.result?.awayGoals) expect(final?.result?.isAfterExtraTime).toBe(true);
    }
  });

  it("of a save from before extra time, settled straight on penalties, are not said to have gone to extra time", () => {
    const cup = openIn("de", 0);
    const first = cupMatches(cup).findIndex((m) => m.round === 0 && m.homeId !== "" && m.awayId !== "");
    const beforeExtraTime = { ...cup, results: cup.results.slice(0, 3 * first) + "110" + cup.results.slice(3 * first + 3) };
    expect(cupMatches(beforeExtraTime)[first]?.result).toEqual({ homeGoals: 1, awayGoals: 1 });
  });

  it("leave every match level after ninety minutes the only one extra time changes, and the round's stream as it was", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const [withExtraTime, straight] = [seededRandom(seed + 100), seededRandom(seed + 100)];
      const playFirstRound = (country: string, random: () => number) => {
        const cup = openIn(country, seed);
        return cupMatches(playCupDay(cup, cup.dates[0] ?? "", clubOf, random)).filter((m) => m.round === 0);
      };
      const de = playFirstRound("de", withExtraTime);
      const fr = playFirstRound("fr", straight);
      expect(withExtraTime()).toBe(straight());
      fr.forEach((match, i) => {
        if (match.result && match.result.homeGoals !== match.result.awayGoals) expect(de[i]).toEqual(match);
      });
    }
  });
});
