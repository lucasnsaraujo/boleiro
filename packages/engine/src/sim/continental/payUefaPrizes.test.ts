import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { RAPIDO } from "../formats.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "../world/loadEurope.js";
import { payUefaPrizes } from "./payUefaPrizes.js";
import { knockoutTie, playEuropeDay, type EuropeanCups, type KnockoutRound } from "./uefaCups.js";

const ARSENAL = "tm-11";
const LIVERPOOL = "tm-31";
const REAL_MADRID = "tm-418";
const start = loadNewGame(5, { coachClubId: ARSENAL, world: loadEurope(2026), formats: RAPIDO });
const europe = start.europe;
if (!europe) throw new Error("no UEFA cups");
const championsLeague = europe.cups.find((cup) => cup.cup === "champions-league");
if (!championsLeague) throw new Error("no Champions League");
const firstMatchday = championsLeague.dates[0] ?? "";
const brl = (eur: number, state: GameState = start) => Math.round(eur * state.market.eurBrl);

/** The game played day by day through `date`, with every prize UEFA paid on the way. */
function playThrough(date: string): { state: GameState; prizes: Extract<DayEvent, { type: "prizePaid" }>[] } {
  let state = start;
  const prizes: Extract<DayEvent, { type: "prizePaid" }>[] = [];
  while (state.date <= date) {
    const day = advanceDay(state, {});
    for (const event of day.events) if (event.type === "prizePaid" && event.competitionId.startsWith("champions-league")) prizes.push(event);
    state = day.state;
  }
  return { state, prizes };
}

describe("UEFA's prize money", () => {
  const opening = playThrough(firstMatchday);
  const paidTo = (clubId: string) => opening.prizes.filter((p) => p.clubId === clubId).reduce((sum, p) => sum + p.amount, 0);
  const seedOf = (clubId: string) => championsLeague.clubIds.indexOf(clubId);

  it("pays a Champions League club of the full tier its starting fee and value share as the league phase opens, the human coach's and the AI's", () => {
    for (const clubId of [ARSENAL, LIVERPOOL]) {
      const fee = 18_620_000 + (935_000 + 346_000) * (36 - seedOf(clubId));
      expect(paidTo(clubId)).toBeGreaterThanOrEqual(brl(fee));
      expect(paidTo(clubId)).toBeLessThanOrEqual(brl(fee + (2_100_000 * 8) / championsLeague.dates.length));
    }
    expect(opening.state.finances[ARSENAL]?.month.revenue.prizes).toBeGreaterThanOrEqual(paidTo(ARSENAL));
  });

  it("pays no club of a result-only league, which keeps no books", () => {
    expect(paidTo(REAL_MADRID)).toBe(0);
    expect(opening.state.finances[REAL_MADRID]).toBeUndefined();
  });

  it("pays both finalists for reaching the final and its winner his bonus, and both Super Cup clubs with a bonus to its winner", () => {
    const final: KnockoutRound = { name: "final", dates: ["2027-06-05"], ties: [[ARSENAL, LIVERPOOL]], results: "---" };
    const withCups = (cups: EuropeanCups): GameState => ({ ...start, europe: cups });
    const before: EuropeanCups = { ...europe, cups: europe.cups.map((cup) => (cup.cup === "champions-league" ? { ...cup, knockout: [] } : cup)) };
    const drawn: EuropeanCups = { ...europe, cups: europe.cups.map((cup) => (cup.cup === "champions-league" ? { ...cup, knockout: [final] } : cup)), superCup: { season: europe.season, date: "2026-08-12", clubIds: [ARSENAL, LIVERPOOL], result: "---" } };
    const reached = payUefaPrizes(withCups(drawn), before).events;
    expect(reached.filter((e) => e.competitionId === "champions-league-2026").map((e) => [e.clubId, e.amount])).toEqual([
      [ARSENAL, brl(18_500_000)],
      [LIVERPOOL, brl(18_500_000)],
    ]);
    const world = start.world;
    if (!world) throw new Error("no world");
    const played = playEuropeDay(playEuropeDay(drawn, world, "2026-08-12", RAPIDO), world, "2027-06-05", RAPIDO);
    const decided = payUefaPrizes(withCups(played), drawn).events;
    const winnerId = knockoutTie(played.cups.find((cup) => cup.cup === "champions-league")?.knockout[0] ?? final, 0).winnerId;
    expect(decided.filter((e) => e.competitionId === "champions-league-2026")).toEqual([{ type: "prizePaid", clubId: winnerId, competitionId: "champions-league-2026", amount: brl(6_500_000) }]);
    const superCup = decided.filter((e) => e.competitionId === "uefa-super-cup-2026").map((e) => e.amount).sort((a, b) => a - b);
    expect(superCup).toEqual([brl(4_000_000), brl(5_000_000)]);
  });
});
