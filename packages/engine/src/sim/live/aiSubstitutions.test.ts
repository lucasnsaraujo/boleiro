import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import type { SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { aiSubstitutions, onPitchAt } from "./aiSubstitutions.js";
import type { MatchEvent } from "./matchTimeline.js";

const CLUB = "ai";
const player = (id: string, group: PositionGroup, strength = 70): SimPlayer => ({
  id, name: id, group, strength, clubId: CLUB, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const GROUPS: PositionGroup[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT"];
const starters = GROUPS.map((group, i) => player(`s${i}`, group));
const bench = (["GK", "DEF", "DEF", "MID", "MID", "ATT", "ATT"] as const).map((group, i) => player(`b${i}`, group, 68));
// The man sent off is the most tired, so he would be the first to come off.
const side = { clubId: CLUB, starters, bench, tiredness: (p: SimPlayer) => (p.id === "s6" ? 100 : 0) };
const STREAMS = 400;

describe("an AI coach's substitutions", () => {
  it("never take off a player already sent off, so a side down to ten stays at ten", () => {
    for (let seed = 0; seed < STREAMS; seed++) {
      for (const minute of [45, 60, 75]) {
        const red: MatchEvent = { type: "card", minute, clubId: CLUB, playerId: "s6", card: "red" };
        const subs = aiSubstitutions(side, [red], 0, () => 0, randomStream(seed).next);
        expect(subs.filter((s) => s.type === "substitution" && s.offId === "s6")).toEqual([]);
        expect(onPitchAt(starters, bench, [red, ...subs], CLUB, 89)).toHaveLength(10);
      }
    }
  });

  it("take off a hurt player at once, for one of his position", () => {
    const hurt: MatchEvent = { type: "injury", minute: 30, clubId: CLUB, playerId: "s2", days: 10 };
    const subs = aiSubstitutions(side, [hurt], 0, () => 0, randomStream(1).next);
    expect(subs[0]).toMatchObject({ type: "substitution", minute: 30, offId: "s2" });
    expect(bench.find((p) => subs[0]?.type === "substitution" && p.id === subs[0].playerId)?.group).toBe("DEF");
  });
});
