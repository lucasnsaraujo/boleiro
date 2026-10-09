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

// guess: a club earning more than anyone in its division's data loses a quarter of the excess (in
// log terms) from sponsorship, membership and other income each season.
const CEILING_PULL = 0.25;

/**
 * Season-start money: clubs that changed division get that division's TV money and ticket price.
 * Sponsorship, membership, other income, crowds and running costs move by the square root of the
 * gap between the divisions' typical revenues (guess: fans and sponsors stay partly loyal, and a
 * stadium does not shrink with the division).
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
    const step = Math.sqrt(economy.typicalRevenue[to] / economy.typicalRevenue[from]);
    const crowdRatio = Math.sqrt(economy.matchday[to].attendance / economy.matchday[from].attendance);
    const bonus = rewarded.has(id) ? Math.round(SPONSOR_BONUS_SHARE * finance.sponsorship) : 0;
    const ticketPrice = economy.matchday[to].price;
    const baseCrowd = Math.round(finance.baseCrowd * crowdRatio);
    const tv = to === "A" ? (serieATvs[id] ?? 0) : economy.tvPerClub[to];
    const expectedTickets = Math.round(baseCrowd * ticketPrice * (homeGames.get(id) ?? 0));
    const commercial = (finance.sponsorship + finance.membership + finance.otherIncome) * step;
    const excess = (tv + expectedTickets + commercial) / economy.revenueCeiling[to];
    const pull = step * (excess > 1 ? excess ** -CEILING_PULL : 1);
    const month = emptyLedger();
    month.revenue.sponsorship = bonus;
    const renewed: ClubFinance = {
      ...finance,
      cash: finance.cash + bonus,
      tv,
      sponsorship: Math.round(finance.sponsorship * pull),
      otherIncome: Math.round(finance.otherIncome * pull),
      membership: Math.round(finance.membership * pull),
      membershipAnchor: Math.round(finance.membershipAnchor * pull),
      infrastructure: Math.round(finance.infrastructure * step),
      ticketPrice,
      baseCrowd,
      expectedTickets,
      month: { ...month, points: 0, games: 0 },
      season: emptyLedger(),
      lastSeason: finance.season,
    };
    return [id, setBoardBudget(renewed, wages.get(id) ?? 0)];
  }));
}
