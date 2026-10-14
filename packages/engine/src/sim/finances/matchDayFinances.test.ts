import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { ClubFinance, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { saveGame } from "../saveGame.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { attendance } from "./recordMatchFinances.js";

const start = loadNewGame(4, { coachClubId: null });
const BUSY_DAY_FIXTURES = 10;
const FORM_GAMES = 5;

const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};

const pointsFor = (scored: number, conceded: number) => (scored > conceded ? 3 : scored === conceded ? 1 : 0);

/** The first day with many fixtures that is not a month's last day, so no closing lands on it. */
function busyMatchDay(state: GameState): { before: GameState; after: GameState; played: Fixture[] } {
  let current = state;
  while (current.season === state.season) {
    const today = current.fixtures.filter((f) => f.date === current.date && !f.result).length;
    const day = advanceDay(current, {});
    if (today >= BUSY_DAY_FIXTURES && !day.state.date.endsWith("-01")) {
      const played = day.events.flatMap((e) => (e.type === "matchPlayed" ? [e.fixture] : []));
      return { before: current, after: day.state, played };
    }
    current = day.state;
  }
  throw new Error(`no day with ${BUSY_DAY_FIXTURES} fixtures in season ${state.season}`);
}

describe("a day of matches", () => {
  const { before, after, played } = busyMatchDay(start);
  const playing = new Set(played.flatMap((f) => [f.homeId, f.awayId]));

  it("books every home side's gate as ticket revenue and both sides' result as form", () => {
    expect(played.length).toBeGreaterThanOrEqual(BUSY_DAY_FIXTURES);
    let gates = 0;
    for (const fixture of played) {
      if (!fixture.result) throw new Error(`fixture ${fixture.id} has no result`);
      const { homeGoals, awayGoals } = fixture.result;
      const sides = [
        { clubId: fixture.homeId, opponentId: fixture.awayId, home: true, points: pointsFor(homeGoals, awayGoals) },
        { clubId: fixture.awayId, opponentId: fixture.homeId, home: false, points: pointsFor(awayGoals, homeGoals) },
      ];
      for (const { clubId, opponentId, home, points } of sides) {
        const was = financeOf(before, clubId);
        const now = financeOf(after, clubId);
        const gate = home ? Math.round(attendance(before, was, clubId, opponentId) * was.ticketPrice) : 0;
        gates += gate;
        expect(now.month.revenue.tickets - was.month.revenue.tickets).toBe(gate);
        expect(now.recentPoints).toEqual([...was.recentPoints, points].slice(-FORM_GAMES));
        expect([now.month.games, now.month.points]).toEqual([was.month.games + 1, was.month.points + points]);
      }
    }
    expect(gates).toBeGreaterThan(0);
  });

  it("leaves the match books of clubs that did not play alone", () => {
    const idle = Object.keys(before.finances).filter((id) => !playing.has(id));
    expect(idle.length).toBeGreaterThan(0);
    for (const clubId of idle) {
      const was = financeOf(before, clubId);
      const now = financeOf(after, clubId);
      expect([now.month.revenue.tickets, now.month.games, now.recentPoints]).toEqual([was.month.revenue.tickets, was.month.games, was.recentPoints]);
    }
  });

  it("does not change the state the day started from", () => {
    const saved = saveGame(before);
    advanceDay(before, {});
    expect(saveGame(before)).toBe(saved);
  });
});

describe("a monthly closing with forced sales", () => {
  let eve = start;
  while (eve.date < "2026-01-31") eve = advanceDay(eve, {}).state;
  const brokeIds = ["vasco-rj", "santos-sp"];
  const wagesOf = wageBillsOf(eve);
  const broke: GameState = {
    ...eve,
    finances: {
      ...eve.finances,
      ...Object.fromEntries(brokeIds.map((id) => {
        const wages = wagesOf.get(id) ?? 0;
        return [id, { ...financeOf(eve, id), cash: -wages, loans: 1e12, wagesOwed: wages, lateWageMonths: 1 }];
      })),
    },
  };

  it("does not change the state it closed", () => {
    const saved = saveGame(broke);
    const { events } = advanceDay(broke, {});
    const sellers = events.flatMap((e) => (e.type === "forcedSale" ? [e.clubId] : []));
    expect(sellers).toEqual(expect.arrayContaining(brokeIds));
    expect(saveGame(broke)).toBe(saved);
  });
});
