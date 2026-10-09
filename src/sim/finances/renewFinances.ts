import type { Club } from "../../data/clubs.js";
import type { Division } from "../../data/players.js";
import type { ClubFinance, Fixture, GameState } from "../gameState.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { standings } from "../standings.js";
import { emptyLedger } from "./ledger.js";
import { serieATv } from "./serieATv.js";
import { setBoardBudget } from "./setBoardBudget.js";
import { tierOf } from "./tierOf.js";

// guess: sponsors pay a tenth of the yearly deal as a bonus for a title or a promotion.
const SPONSOR_BONUS_SHARE = 0.1;

/**
 * Season-start money: clubs that changed division get that division's TV money, and their
 * sponsorship and other income scale with the division's typical revenue. Fans are loyal, so
 * crowds and membership move only by the square root of the gap (guess). Running costs follow
 * the same square root (guess: a stadium does not shrink with the division).
 */
export function renewFinances(
  ended: GameState,
  clubs: Record<string, Club>,
  fixtures: readonly Fixture[],
  outcomes: Record<Division, LeagueOutcome>,
): Record<string, ClubFinance> {
  const { economy } = ended;
  const serieA = Object.values(ended.competitions).find((c) => c.division === "A" && c.season === ended.season);
  const lastTable = serieA
    ? standings(serieA.clubIds, ended.fixtures.filter((f) => f.competitionId === serieA.id), serieA.drawOrder).map((row) => row.clubId)
    : [];
  const newSerieA = new Set(Object.values(clubs).filter((c) => c.division === "A").map((c) => c.id));
  const ranked = [...lastTable.filter((id) => newSerieA.has(id)), ...[...newSerieA].filter((id) => !lastTable.includes(id))];
  const serieATvs = serieATv(economy, ranked, (id) => clubs[id]?.fanbase ?? 0);
  const rewarded = new Set(Object.values(outcomes).flatMap((o) => [o.championId, ...o.promotedIds]));
  const homeGames = new Map<string, number>();
  for (const f of fixtures) homeGames.set(f.homeId, (homeGames.get(f.homeId) ?? 0) + 1);
  const wages = new Map<string, number>();
  for (const p of Object.values(ended.players)) wages.set(p.clubId, (wages.get(p.clubId) ?? 0) + p.wage);

  return Object.fromEntries(Object.entries(ended.finances).map(([id, finance]) => {
    const before = ended.clubs[id];
    const club = clubs[id];
    if (!before || !club) return [id, finance];
    const from = tierOf(before);
    const to = tierOf(club);
    const revenueRatio = economy.typicalRevenue[to] / economy.typicalRevenue[from];
    const fanRatio = Math.sqrt(revenueRatio);
    const crowdRatio = Math.sqrt(economy.matchday[to].attendance / economy.matchday[from].attendance);
    const bonus = rewarded.has(id) ? Math.round(SPONSOR_BONUS_SHARE * finance.sponsorship) : 0;
    const ticketPrice = economy.matchday[to].price;
    const baseCrowd = Math.round(finance.baseCrowd * crowdRatio);
    const month = emptyLedger();
    month.revenue.sponsorship = bonus;
    const renewed: ClubFinance = {
      ...finance,
      cash: finance.cash + bonus,
      tv: to === "A" ? (serieATvs[id] ?? 0) : economy.tvPerClub[to],
      sponsorship: Math.round(finance.sponsorship * revenueRatio),
      otherIncome: Math.round(finance.otherIncome * revenueRatio),
      membership: Math.round(finance.membership * fanRatio),
      membershipAnchor: Math.round(finance.membershipAnchor * fanRatio),
      infrastructure: Math.round(finance.infrastructure * fanRatio),
      ticketPrice,
      baseCrowd,
      expectedTickets: Math.round(baseCrowd * ticketPrice * (homeGames.get(id) ?? 0)),
      month: { ...month, points: 0, games: 0 },
      season: emptyLedger(),
      lastSeason: finance.season,
    };
    return [id, setBoardBudget(renewed, wages.get(id) ?? 0)];
  }));
}
