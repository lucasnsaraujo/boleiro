import { describe, expect, it } from "vitest";
import { pickLineup } from "../../engine/match.js";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { ClubFinance, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { totalCosts, totalRevenue } from "./ledger.js";

const start = loadNewGame(5, { coachClubId: null });

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

const withFinance = (state: GameState, clubId: string, patch: Partial<ClubFinance>): GameState => ({
  ...state,
  finances: { ...state.finances, [clubId]: { ...financeOf(state, clubId), ...patch } },
});

/** The club's wage bill, with its share of the wages of players it has lent out. */
const monthlyWages = (state: GameState, clubId: string) => wageBillsOf(state).get(clubId) ?? 0;

const closingsOf = (events: DayEvent[], clubId: string) =>
  events.flatMap((e) => (e.type === "monthClosed" && e.clubId === clubId ? [e] : []));

describe("the monthly closing", () => {
  const january = playUntil(start, "2026-01-31");
  const february = advanceDay(january.state, {});

  it("closes every club's month on the first day of the next month", () => {
    expect(january.events.filter((e) => e.type === "monthClosed")).toEqual([]);
    expect(february.state.date).toBe("2026-02-01");
    const closings = february.events.flatMap((e) => (e.type === "monthClosed" ? [e] : []));
    expect(closings.map((e) => e.clubId).sort()).toEqual(Object.keys(start.clubs).sort());
    expect(new Set(closings.map((e) => e.month))).toEqual(new Set(["2026-01"]));
  });

  it("pays wages, infrastructure and a twelfth of the yearly TV, sponsorship and membership", () => {
    const before = financeOf(january.state, "palmeiras-sp");
    const [closing] = closingsOf(february.events, "palmeiras-sp");
    expect(closing?.ledger.costs.wages).toBe(monthlyWages(january.state, "palmeiras-sp"));
    expect(closing?.ledger.revenue.tv).toBe(Math.round(before.tv / 12));
    expect(closing?.ledger.revenue.sponsorship).toBe(Math.round(before.sponsorship / 12));
    expect(closing?.ledger.revenue.membership).toBe(Math.round(before.membership / 12));
    expect(closing?.ledger.costs.infrastructure).toBe(Math.round(before.infrastructure / 12));
  });

  it("moves cash by revenue minus costs, plus loans taken, minus debt repaid", () => {
    for (const clubId of ["palmeiras-sp", "mirassol-sp"]) {
      const before = financeOf(start, clubId);
      const after = financeOf(february.state, clubId);
      const [closing] = closingsOf(february.events, clubId);
      if (!closing) throw new Error("no closing");
      expect(after.cash - before.cash).toBe(totalRevenue(closing.ledger) - totalCosts(closing.ledger) + closing.borrowed - closing.debtRepaid);
      expect(after.season.revenue.tv).toBe(closing.ledger.revenue.tv);
    }
  });

  it("keeps each club's last closing in its finances until the next one", () => {
    expect(financeOf(start, "palmeiras-sp").lastClosing).toBeNull();
    const [closing] = closingsOf(february.events, "palmeiras-sp");
    if (!closing) throw new Error("no closing");
    const kept = { month: closing.month, ledger: closing.ledger, cash: closing.cash };
    expect(financeOf(february.state, "palmeiras-sp").lastClosing).toEqual(kept);
    expect(financeOf(advanceDay(february.state, {}).state, "palmeiras-sp").lastClosing).toEqual(kept);
  });

  it("sells tickets only for home matches and never past the stadium's capacity", () => {
    const { state, events } = playUntil(february.state, "2026-07-01");
    for (const clubId of ["flamengo-rj", "mirassol-sp", "remo-pa"]) {
      const homeGames = state.fixtures.filter((f) => f.homeId === clubId && f.result).length;
      const tickets = financeOf(state, clubId).season.revenue.tickets;
      const club = state.clubs[clubId];
      expect(homeGames).toBeGreaterThan(0);
      expect(tickets).toBeGreaterThan(0);
      expect(tickets).toBeLessThanOrEqual((club?.capacity ?? 0) * financeOf(state, clubId).ticketPrice * homeGames);
    }
    for (const closing of closingsOf(events, "remo-pa")) {
      const hadHomeGame = state.fixtures.some((f) => f.homeId === "remo-pa" && f.date.startsWith(closing.month));
      expect(closing.ledger.revenue.tickets > 0).toBe(hadHomeGame);
    }
  });
});

describe("a club that runs out of cash", () => {
  const eve = playUntil(start, "2026-01-31").state;
  const clubId = "vasco-rj";
  const wages = monthlyWages(eve, clubId);

  it("first borrows from the bank and pays wages on time", () => {
    const { state, events } = advanceDay(withFinance(eve, clubId, { cash: -wages }), {});
    expect(financeOf(state, clubId).loans).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "wagesLate" && e.clubId === clubId)).toBe(false);
    expect(financeOf(state, clubId).lateWageMonths).toBe(0);
  });

  it("pays wages late once the loans reach the cap", () => {
    const broke = withFinance(eve, clubId, { cash: -wages, loans: 1e12 });
    const { state, events } = advanceDay(broke, {});
    const late = events.find((e) => e.type === "wagesLate" && e.clubId === clubId);
    expect(late?.type === "wagesLate" && late.owed).toBeGreaterThan(0);
    expect(financeOf(state, clubId).loans).toBe(1e12);
    expect(financeOf(state, clubId).wagesOwed).toBeGreaterThan(0);
    expect(financeOf(state, clubId).lateWageMonths).toBe(1);
  });

  it("loses members while wages are late", () => {
    const broke = withFinance(eve, clubId, { cash: -wages, loans: 1e12 });
    expect(financeOf(advanceDay(broke, {}).state, clubId).membership).toBeLessThan(financeOf(eve, clubId).membership);
  });

  it("sells its most valuable non-key player without asking after a second late month", () => {
    const broke = withFinance(eve, clubId, { cash: -wages, loans: 1e12, wagesOwed: wages, lateWageMonths: 1 });
    const squad = Object.values(broke.players).filter((p) => p.clubId === clubId);
    const keyPlayers = new Set(pickLineup(squad));
    const expected = squad.filter((p) => !keyPlayers.has(p)).sort((a, b) => b.wage - a.wage)[0];
    const { state, events } = advanceDay(broke, {});
    const sale = events.find((e) => e.type === "forcedSale" && e.clubId === clubId);
    if (sale?.type !== "forcedSale") throw new Error("no forced sale");
    expect(sale.playerId).toBe(expected?.id);
    expect(sale.fee).toBeGreaterThan(0);
    expect(state.players[sale.playerId]?.clubId).not.toBe(clubId);
    expect(financeOf(state, clubId).season.revenue.playerSales - financeOf(broke, clubId).season.revenue.playerSales - financeOf(broke, clubId).month.revenue.playerSales).toBe(sale.fee);
    if (sale.buyerId) expect(state.players[sale.playerId]?.clubId).toBe(sale.buyerId);
    else expect(state.players[sale.playerId]).toBeUndefined();
  });

  it("does not sell anyone while it can still borrow", () => {
    const { events } = advanceDay(withFinance(eve, clubId, { cash: -wages, lateWageMonths: 5 }), {});
    expect(events.some((e) => e.type === "forcedSale")).toBe(false);
  });
});

describe("the board's budget", () => {
  it("raises the wage cap and transfer budget at the mid-year window when revenue grows", () => {
    const june = playUntil(start, "2026-06-30").state;
    const before = financeOf(june, "mirassol-sp");
    const richer = withFinance(june, "mirassol-sp", { sponsorship: before.sponsorship * 4 });
    const july = advanceDay(richer, {}).state;
    expect(july.date).toBe("2026-07-01");
    expect(financeOf(july, "mirassol-sp").wageCap).toBeGreaterThan(before.wageCap);
    expect(financeOf(july, "mirassol-sp").transferBudget).toBeGreaterThan(before.transferBudget);
  });
});
