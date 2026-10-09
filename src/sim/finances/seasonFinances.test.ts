import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { ClubFinance, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";

function playUntil(state: GameState, date: string): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, {});
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};

describe("club finances across a season change", () => {
  const { state: before } = playUntil(loadNewGame(3, { coachClubId: null }), "2026-12-31");
  const { state: after, events } = playUntil(before, "2027-01-01");
  const ended = events.find((e) => e.type === "seasonEnded");
  const outcome = (division: string) => {
    if (ended?.type !== "seasonEnded") throw new Error("season did not end");
    const found = Object.entries(ended.outcomes).find(([id]) => id.startsWith(`serie-${division}`));
    if (!found) throw new Error(`no Série ${division} outcome`);
    return found[1];
  };

  it("pays promoted clubs Série A TV money and relegated clubs Série B's", () => {
    const { min, perClubB } = { min: after.economy.serieATv.perClubMin, perClubB: after.economy.tvPerClub.B };
    for (const id of outcome("b").promotedIds) expect(financeOf(after, id).tv).toBeGreaterThanOrEqual(min);
    for (const id of outcome("a").relegatedIds) expect(financeOf(after, id).tv).toBe(perClubB);
  });

  it("shrinks sponsorship on relegation and grows it on promotion", () => {
    for (const id of outcome("a").relegatedIds) expect(financeOf(after, id).sponsorship).toBeLessThan(financeOf(before, id).sponsorship);
    for (const id of outcome("b").promotedIds) expect(financeOf(after, id).sponsorship).toBeGreaterThan(financeOf(before, id).sponsorship);
  });

  it("pays the Série A champion a sponsor bonus", () => {
    const champion = outcome("a").championId;
    expect(financeOf(after, champion).month.revenue.sponsorship).toBeGreaterThan(0);
    // The December closing (which may repay old debt), pre-contract arrivals and continental prize money
    // land the same day: the bonus is what is left of the day's cash change once they are taken out.
    const closing = events.find((e) => e.type === "monthClosed" && e.clubId === champion);
    if (closing?.type !== "monthClosed") throw new Error("no closing");
    const { costs, revenue } = financeOf(after, champion).month;
    const transferMoney = revenue.playerSales - costs.transferFees - costs.signingFees - costs.agentFees;
    expect(financeOf(after, champion).cash - closing.cash - transferMoney - revenue.prizes).toBe(revenue.sponsorship);
  });

  it("keeps money booked on 1 January before the season turns in January's books", () => {
    const salary = 123_456;
    const coached: GameState = { ...before, coachClubId: "flamengo-rj", coach: { ...before.coach, contract: { salary, untilSeason: 2030 } } };
    const turned = advanceDay(coached, {}).state;
    expect(financeOf(turned, "flamengo-rj").month.costs.wages).toBe(salary);
  });

  it("files the finished season's books and opens empty ones", () => {
    const flamengo = financeOf(after, "flamengo-rj");
    expect(flamengo.lastSeason?.revenue.tv).toBeGreaterThan(0);
    expect(flamengo.season.revenue.tv).toBe(0);
  });

  it("sets a new budget for the season", () => {
    const changed = Object.keys(after.finances).filter((id) => financeOf(after, id).wageCap !== financeOf(before, id).wageCap);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("moves each wage bill part of the way toward the board's new wage cap", () => {
    let rises = 0;
    let cuts = 0;
    for (const clubId of Object.keys(after.clubs)) {
      // The drift runs on everyone who did not retire; contracts that ended are settled after it, the same day.
      const drifted = Object.values(before.players).filter((p) => p.clubId === clubId && (after.players[p.id] || after.market.freeAgents[p.id]));
      const top = drifted.filter((p) => after.players[p.id]?.clubId === clubId).sort((a, b) => b.wage - a.wage)[0];
      if (!top) continue;
      const ratio = (after.players[top.id]?.wage ?? 0) / top.wage;
      // Youth players join before the drift, so their wage before it is today's divided by the club's factor.
      const youth = events.flatMap((e) => (e.type === "youthPromoted" && e.clubId === clubId ? [after.players[e.playerId]] : []));
      const bill = drifted.reduce((sum, p) => sum + p.wage, 0) + youth.reduce((sum, p) => sum + (p?.wage ?? 0) / ratio, 0);
      const cap = financeOf(after, clubId).wageCap;
      if (Math.abs(cap / bill - 1) < 0.05) continue;
      expect(ratio).toBeGreaterThanOrEqual(0.49);
      expect(ratio).toBeLessThanOrEqual(1.51);
      expect(ratio > 1).toBe(cap > bill);
      if (ratio > 1) rises++;
      else cuts++;
    }
    expect(rises + cuts).toBeGreaterThan(0);
  });

  it("survives a save and load and plays on identically", () => {
    const loaded = loadGame(saveGame(after));
    expect(loaded).toEqual(after);
    expect(playUntil(loaded, "2027-02-02").events).toEqual(playUntil(after, "2027-02-02").events);
  }, 20_000); // the January window's market days make this month twice the work of a quiet one

  it("refuses a save without finances", () => {
    const withoutFinances = Object.fromEntries(Object.entries(after).filter(([key]) => key !== "finances"));
    expect(() => loadGame(JSON.stringify(withoutFinances))).toThrow();
  });
});
