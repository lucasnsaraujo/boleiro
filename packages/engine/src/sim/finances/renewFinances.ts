import type { Club } from "@boleiro/data/clubs";
import type { ClubFinance, Competition, Fixture, GameState } from "../gameState.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { standings } from "../standings.js";
import { cupEntriesOf } from "../startSeason.js";
import { COPA_DO_BRASIL } from "../copaDoBrasil.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { continentalQualifiers } from "./continentalQualifiers.js";
import { expectedCopaPrize } from "./expectedCopaPrize.js";
import { expectedHomeGames } from "./expectedHomeGames.js";
import { emptyLedger } from "./ledger.js";
import { serieATv } from "./serieATv.js";
import { setBoardBudget } from "./setBoardBudget.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { tierOf } from "./tierOf.js";

// guess: sponsors pay a tenth of the yearly deal as a bonus for a title or a promotion.
const SPONSOR_BONUS_SHARE = 0.1;

/** What a club's deals with bonus terms of their own pay a year: they pay those bonuses (sponsorDeals.ts) instead of the usual tenth. */
function ownTermsYearly(state: Pick<GameState, "sponsors">, clubId: string): number {
  return (state.sponsors?.[clubId]?.contracts ?? []).reduce((sum, c) => sum + (c.bonuses ? c.yearly : 0), 0);
}

// guess: a club earning more than anyone in its division's data loses a quarter of the excess (in
// log terms) from sponsorship, membership and other income each season, from its second season there.
const CEILING_PULL = 0.25;
// Sponsorship, membership, other income and running costs move by the gap between the divisions' typical
// revenues to this power: ×0.82 from Série A to B. Athletico's members paid 18% less in its 2025 Série B year
// than in 2024 (R$59.3m to R$48.4m) while its sponsors and other commercial income held (R$132.2m to
// R$133.0m) and its TV money fell 59% (club's 2025 accounts, note 18, copy hosted by Poder360,
// https://static.poder360.com.br/uploads/2026/07/Relatorio_Club_Athletico_Paranaense_2025.pdf).
const LOYALTY_EXPONENT = 0.13;

/**
 * CONMEBOL's money for next season's continental entrants, in BRL at today's rate (the dollar moves
 * with the market's euro): what the board expects from the cups. guess: in a game without South
 * America, which plays no CONMEBOL cup, it is paid in full when the season turns, as the place is
 * settled then, though CONMEBOL pays during the group stage; a game that plays the cups pays it
 * match by match (payContinentalPrizes).
 */
function continentalPrizes(ended: GameState, serieATable: readonly string[]): Map<string, number> {
  const cup = Object.values(ended.competitions).find((c) => c.kind === "cup" && c.season === ended.season);
  const copa = cup?.kind === "cup" ? COPA_DO_BRASIL.finalists(cup, ended.fixtures.filter((f) => f.competitionId === cup.id)) : null;
  const { usdBrl, libertadoresGroups, libertadoresPreliminary, sulAmericanaGroups } = ended.economy.continental;
  const brl = (usd: number) => Math.round(usd * usdBrl * (ended.market.eurBrl / OPENING_EUR_BRL));
  const qualifiers = continentalQualifiers(serieATable, copa);
  return new Map([
    ...qualifiers.libertadoresGroups.map((id): [string, number] => [id, brl(libertadoresGroups)]),
    ...qualifiers.libertadoresPreliminary.map((id): [string, number] => [id, brl(libertadoresPreliminary)]),
    ...qualifiers.sulAmericana.map((id): [string, number] => [id, brl(sulAmericanaGroups)]),
  ]);
}

/**
 * Season-start money: clubs that changed division get that division's TV money and ticket price
 * (scaled by how far the coach set his club's price from the old division's average).
 * Crowds move by the square root of the gap between the divisions' typical crowds (guess); sponsorship,
 * membership, other income and running costs move far less (LOYALTY_EXPONENT): sponsors and members
 * stay mostly loyal, and a stadium does not shrink with the division.
 */
export function renewFinances(
  ended: GameState,
  clubs: Record<string, Club>,
  competitions: Record<string, Competition>,
  fixtures: readonly Fixture[],
  outcomes: readonly LeagueOutcome[],
): Record<string, ClubFinance> {
  const { economy } = ended;
  const serieA = Object.values(ended.competitions).find((c) => c.kind === "league" && c.division === "A" && c.season === ended.season);
  const lastTable = serieA
    ? standings(serieA.clubIds, ended.fixtures.filter((f) => f.competitionId === serieA.id), serieA.drawOrder).map((row) => row.clubId)
    : [];
  const newSerieA = new Set(Object.values(clubs).filter((c) => c.division === "A").map((c) => c.id));
  const ranked = [...lastTable.filter((id) => newSerieA.has(id)), ...[...newSerieA].filter((id) => !lastTable.includes(id))];
  const serieATvs = serieATv(economy, ranked, (id) => clubs[id]?.fanbase ?? 0);
  const rewarded = new Set(outcomes.flatMap((o) => [o.championId, ...o.promotedIds]));
  const homeGames = expectedHomeGames(Object.values(competitions), fixtures);
  const cupEntryStage = new Map(cupEntriesOf(competitions).flatMap((ids, stage) => ids.map((id) => [id, stage])));
  const wages = wageBillsOf(ended);
  const continentalPrize = continentalPrizes(ended, lastTable);
  const isPlayingCups = ended.economy.continentalStages !== undefined;

  return Object.fromEntries(Object.entries(ended.finances).map(([id, finance]) => {
    const before = ended.clubs[id];
    const club = clubs[id];
    if (!before || !club) return [id, finance];
    const from = tierOf(before);
    const to = tierOf(club);
    const loyalty = (economy.typicalRevenue[to] / economy.typicalRevenue[from]) ** LOYALTY_EXPONENT;
    const crowdRatio = Math.sqrt(economy.matchday[to].attendance / economy.matchday[from].attendance);
    const bonus = rewarded.has(id) ? Math.round(SPONSOR_BONUS_SHARE * Math.max(0, finance.sponsorship - ownTermsYearly(ended, id))) : 0;
    // A price the coach set keeps its distance from the average; everyone else's stays on it.
    const ticketPrice = Math.round(economy.matchday[to].price * (finance.ticketPrice / economy.matchday[from].price));
    const baseCrowd = Math.round(finance.baseCrowd * crowdRatio);
    const tv = to === "A" ? (serieATvs[id] ?? economy.tvPerClub.A) : economy.tvPerClub[to];
    const expectedTickets = Math.round(baseCrowd * ticketPrice * (homeGames.get(id) ?? 0));
    const entryStage = cupEntryStage.get(id);
    const copaPrizes = entryStage === undefined ? 0 : Math.round(expectedCopaPrize(economy.copaDoBrasil, entryStage, to !== "A" && to !== "B"));
    const continental = continentalPrize.get(id) ?? 0;
    const expectedPrizes = copaPrizes + continental;
    const paidNow = isPlayingCups ? 0 : continental;
    // The prizes a club expects come out of its other income, so what last season took out goes back
    // in before this season's comes out; together they stay the club's unsimulated income.
    const unsimulated = finance.otherIncome + finance.prizesOutOfOtherIncome;
    const commercial = (finance.sponsorship + finance.membership + unsimulated) * loyalty;
    const excess = (tv + expectedTickets + commercial) / economy.revenueCeiling[to];
    const pull = loyalty * (excess > 1 && from === to ? excess ** -CEILING_PULL : 1);
    // The season turns on 1 January after December's closing, so `month` already holds January's
    // first day (coach salary, forced-sale fees); it carries over with the bonus and continental money added.
    const { revenue } = finance.month;
    const month = { ...finance.month, revenue: { ...revenue, sponsorship: revenue.sponsorship + bonus, prizes: revenue.prizes + paidNow } };
    const otherIncomeBeforePrizes = Math.round(unsimulated * pull);
    const prizesOutOfOtherIncome = Math.min(otherIncomeBeforePrizes, expectedPrizes);
    const renewed: ClubFinance = {
      ...finance,
      cash: finance.cash + bonus + paidNow,
      tv,
      sponsorship: Math.round(finance.sponsorship * pull),
      otherIncome: otherIncomeBeforePrizes - prizesOutOfOtherIncome,
      prizesOutOfOtherIncome,
      membership: Math.round(finance.membership * pull),
      membershipAnchor: Math.round(finance.membershipAnchor * pull),
      infrastructure: Math.round(finance.infrastructure * loyalty),
      ticketPrice,
      baseCrowd,
      expectedTickets,
      expectedPrizes,
      month,
      season: emptyLedger(),
      lastSeason: finance.season,
    };
    return [id, setBoardBudget(renewed, wages.get(id) ?? 0)];
  }));
}
