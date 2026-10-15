import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.js";
import { drawLeaguePhase, LEAGUE_PHASE_CLUBS } from "./leaguePhaseDraw.js";

const clubs = Array.from({ length: LEAGUE_PHASE_CLUBS }, (_, i) => `c${i}`);
// Six countries of six clubs, spread over the pots as a real field's big countries are.
const countryOf = (id: string) => `k${Number(id.slice(1)) % 6}`;
const potOf = (id: string) => Math.floor(clubs.indexOf(id) / 9);
const matchdays = drawLeaguePhase(clubs, countryOf, seededRandom(4));
const matches = matchdays.flat();

describe("a UEFA league phase draw", () => {
  it("gives eight matchdays on which every club plays once", () => {
    expect(matchdays).toHaveLength(8);
    for (const day of matchdays) expect(day.flat().toSorted()).toEqual(clubs.toSorted());
  });

  it("gives every club eight different opponents, two from each pot, one of them at home", () => {
    for (const club of clubs) {
      const home = matches.filter(([h]) => h === club).map(([, a]) => a);
      const away = matches.filter(([, a]) => a === club).map(([h]) => h);
      expect(new Set([...home, ...away]).size).toBe(8);
      for (let pot = 0; pot < 4; pot++) {
        expect(home.filter((id) => potOf(id) === pot)).toHaveLength(1);
        expect(away.filter((id) => potOf(id) === pot)).toHaveLength(1);
      }
    }
  });

  it("keeps clubs of one country apart", () => {
    expect(matches.filter(([h, a]) => countryOf(h) === countryOf(a))).toEqual([]);
  });

  it("draws differently on another stream", () => {
    expect(drawLeaguePhase(clubs, countryOf, seededRandom(5))).not.toEqual(matchdays);
  });
});
