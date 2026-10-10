import type { Club } from "../../data/clubs.js";
import type { CompetitionMoney, ContinentalStage } from "../../data/competition-money.js";
import type { ClubFinances, DivisionFinances, Finances } from "../../data/finances.js";
import type { ClubFinance, Competition, Economy, Fixture, SimPlayer, Tier } from "../gameState.js";
import { cupEntriesOf } from "../startSeason.js";
import { expectedCopaPrize } from "./expectedCopaPrize.js";
import { expectedHomeGames } from "./expectedHomeGames.js";
import { emptyLedger } from "./ledger.js";
import { serieATv } from "./serieATv.js";
import { setBoardBudget, TRANSFER_SHARE_OF_REVENUE } from "./setBoardBudget.js";
import { squadStrength } from "./squadStrength.js";
import { tierOf } from "./tierOf.js";

export type FinanceData = { clubs: readonly ClubFinances[]; divisionEstimates: readonly DivisionFinances[] };

type Money = Pick<Finances, "wageBill" | "netDebt"> & Omit<Finances["revenue"], "broadcasting" | "matchday">;

// guess: state-only clubs have no published accounts; taken as half a small Série D club.
const STATE_ONLY_SHARE_OF_SMALL_SERIE_D = 0.5;
// guess: state-only crowds and tickets, below the Série D guess of 2,000 at R$20.
const STATE_ONLY_MATCHDAY = { attendance: 1000, price: 15 };
// guess: stadiums rarely sell the last tenth of seats (away sections, safety gaps).
export const SELLABLE_SHARE_OF_CAPACITY = 0.9;
// guess: stadium, training ground, staff and travel take at least a tenth of revenue without player sales.
// Above that floor they absorb whatever wages and the transfer reserve leave, so clubs open near break-even.
const MIN_INFRASTRUCTURE_SHARE_OF_REVENUE = 0.1;
// guess: clubs start with one month of revenue in the bank unless their accounts show net cash.
const OPENING_CASH_MONTHS_OF_REVENUE = 1;
// guess: wages rise about 10% per strength point, so a 70 earns about 20 times a 40 at the same club.
const WAGE_GROWTH_PER_STRENGTH_POINT = 0.1;

const moneyOf = ({ revenue, wageBill, netDebt }: Finances): Money => ({ ...revenue, wageBill, netDebt });

const lerp = (a: Money, b: Money, t: number): Money => {
  const mix = (key: keyof Money) => a[key] + (b[key] - a[key]) * t;
  return {
    total: mix("total"), membership: mix("membership"), sponsorship: mix("sponsorship"), playerSales: mix("playerSales"),
    wageBill: mix("wageBill"), netDebt: mix("netDebt"),
  };
};

const scale = (a: Money, factor: number): Money => ({
  total: a.total * factor, membership: a.membership * factor, sponsorship: a.sponsorship * factor,
  playerSales: a.playerSales * factor, wageBill: a.wageBill * factor, netDebt: a.netDebt * factor,
});

const quantile = (values: readonly number[], q: number): number =>
  [...values].sort((a, b) => a - b)[Math.floor(q * (values.length - 1))] ?? 0;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const operatingRevenue = (row: Money) => row.total - row.playerSales;

function estimateOf(data: FinanceData, division: Tier, size: DivisionFinances["size"]): Money {
  const row = data.divisionEstimates.find((r) => r.division === division && r.size === size);
  if (!row) throw new Error(`finances: no ${size} estimate for Série ${division}`);
  return moneyOf(row);
}

function economyOf(data: FinanceData, competitionMoney: CompetitionMoney): Economy {
  const stateOnly = scale(estimateOf(data, "D", "small"), STATE_ONLY_SHARE_OF_SMALL_SERIE_D);
  const { tv, matchday, copaDoBrasil } = competitionMoney;
  const prizeOf = (round: string) => copaDoBrasil.rounds.find((r) => r.round === round)?.prize ?? 0;
  const usdOf = ({ stages }: { stages: readonly ContinentalStage[] }, stage: string) => {
    const found = stages.find((s) => s.stage === stage);
    if (!found) throw new Error(`competition money: no continental stage ${stage}`);
    return found.prizeUsd;
  };
  return {
    serieATv: { pool: tv.A.totalPool, shares: tv.A.shares, perClubMin: tv.A.perClubMin, perClubMax: tv.A.perClubMax },
    tvPerClub: { A: tv.A.totalPool / 20, B: tv.B.perClub, C: tv.C.perClub, D: tv.D.perClub, state: 0 },
    matchday: {
      A: { attendance: matchday.A.averageAttendance, price: matchday.A.averageTicketPrice },
      B: { attendance: matchday.B.averageAttendance, price: matchday.B.averageTicketPrice },
      C: { attendance: matchday.C.averageAttendance, price: matchday.C.averageTicketPrice },
      D: { attendance: matchday.D.averageAttendance, price: matchday.D.averageTicketPrice },
      state: STATE_ONLY_MATCHDAY,
    },
    typicalRevenue: {
      // guess: clubs that move between Série A and B are the smaller ones, so Série A is typified by its lower quartile.
      A: quantile(data.clubs.map((row) => operatingRevenue(moneyOf(row))), 0.25),
      B: operatingRevenue(estimateOf(data, "B", "median")),
      C: operatingRevenue(estimateOf(data, "C", "median")),
      D: operatingRevenue(estimateOf(data, "D", "median")),
      state: operatingRevenue(stateOnly),
    },
    revenueCeiling: {
      A: Math.max(...data.clubs.map((row) => operatingRevenue(moneyOf(row)))),
      B: operatingRevenue(estimateOf(data, "B", "large")),
      C: operatingRevenue(estimateOf(data, "C", "large")),
      D: operatingRevenue(estimateOf(data, "D", "large")),
      // guess: no state-only club earns more than a large Série D club.
      state: operatingRevenue(estimateOf(data, "D", "large")),
    },
    copaDoBrasil: {
      stagePrizes: copaDoBrasil.rounds
        .filter((r) => r.round !== "runner-up" && r.round !== "champion")
        .map(({ prize, prizeLowerDivisions }) => ({ prize, prizeLowerDivisions })),
      runnerUp: prizeOf("runner-up"),
      champion: prizeOf("champion"),
    },
    // guess: Brazil's preliminary-phase clubs enter in the second round, as they have in recent
    // editions, and earn its prize; the game does not play them through to the group stage.
    continental: {
      usdBrl: competitionMoney.usdToBrl.rate,
      libertadoresGroups: usdOf(competitionMoney.libertadores, "group-stage"),
      libertadoresPreliminary: usdOf(competitionMoney.libertadores, "preliminary-2"),
      sulAmericanaGroups: usdOf(competitionMoney.sulAmericana, "group-stage"),
    },
  };
}

/** Série B–D clubs sit between the small, median and large estimates by squad strength within their division. */
function moneyByRank(data: FinanceData, tier: Tier, rank: number, count: number): Money {
  if (tier === "state") return scale(estimateOf(data, "D", "small"), STATE_ONLY_SHARE_OF_SMALL_SERIE_D);
  const position = count > 1 ? rank / (count - 1) : 0.5;
  return position < 0.5
    ? lerp(estimateOf(data, tier, "small"), estimateOf(data, tier, "median"), position * 2)
    : lerp(estimateOf(data, tier, "median"), estimateOf(data, tier, "large"), position * 2 - 1);
}

/** Monthly wages that add up to the club's wage bill, weighted towards its stronger players. */
function wagesOf(squad: readonly Omit<SimPlayer, "wage">[], monthlyBill: number): [string, number][] {
  const weights = squad.map((p) => Math.exp(WAGE_GROWTH_PER_STRENGTH_POINT * p.strength));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return squad.map((p, i) => [p.id, Math.max(1, Math.round((monthlyBill * (weights[i] ?? 0)) / total))]);
}

/**
 * Opening money for every club, the division rules, and each player's monthly wage. `competitions`
 * and their opening `fixtures` give the home games a club can expect over the season: their gate and
 * the Copa prizes a club can expect come out of its other income, which the accounts' revenue would
 * otherwise count twice.
 */
export function openingFinances(
  clubs: Record<string, Club>,
  players: readonly Omit<SimPlayer, "wage">[],
  competitions: Record<string, Competition>,
  fixtures: readonly Fixture[],
  data: FinanceData,
  competitionMoney: CompetitionMoney,
): { economy: Economy; finances: Record<string, ClubFinance>; wages: Record<string, number> } {
  const economy = economyOf(data, competitionMoney);
  const squads = new Map<string, Omit<SimPlayer, "wage">[]>();
  for (const player of players) squads.set(player.clubId, [...(squads.get(player.clubId) ?? []), player]);
  const strength = new Map([...squads].map(([id, squad]) => [id, squadStrength(squad)]));
  const byTier = new Map<Tier, Club[]>();
  for (const club of Object.values(clubs)) byTier.set(tierOf(club), [...(byTier.get(tierOf(club)) ?? []), club]);
  const ascending = (tier: Tier) =>
    (byTier.get(tier) ?? []).map((c) => c.id).sort((a, b) => (strength.get(a) ?? 0) - (strength.get(b) ?? 0) || a.localeCompare(b));
  const serieA = serieATv(economy, ascending("A").reverse(), (id) => clubs[id]?.fanbase ?? 0);
  const smallestSerieA = [...data.clubs].sort((a, b) => a.revenue.total - b.revenue.total)[0];
  const homeGames = expectedHomeGames(Object.values(competitions), fixtures);
  const cupEntryStage = new Map(cupEntriesOf(competitions).flatMap((ids, stage) => ids.map((id) => [id, stage])));

  const finances: Record<string, ClubFinance> = {};
  const wages: Record<string, number> = {};
  for (const [tier, members] of byTier) {
    const rankOf = new Map(ascending(tier).map((id, rank) => [id, rank]));
    const medianFans = median(members.map((c) => c.fanbase));
    for (const club of members) {
      const row = data.clubs.find((r) => r.clubId === club.id) ?? (tier === "A" ? smallestSerieA : undefined);
      const base = row ? moneyOf(row) : moneyByRank(data, tier, rankOf.get(club.id) ?? 0, members.length);
      const { attendance, price } = economy.matchday[tier];
      const fanFactor = medianFans > 0 ? Math.sqrt(club.fanbase / medianFans) : 1;
      const baseCrowd = Math.min(SELLABLE_SHARE_OF_CAPACITY * club.capacity, attendance * fanFactor);
      const expectedTickets = Math.round(baseCrowd * price * (homeGames.get(club.id) ?? 0));
      const tv = tier === "A" ? (serieA[club.id] ?? 0) : economy.tvPerClub[tier];
      const revenue = operatingRevenue(base);
      const entryStage = cupEntryStage.get(club.id);
      const cupPrizes = entryStage === undefined ? 0 : expectedCopaPrize(economy.copaDoBrasil, entryStage, tier !== "A" && tier !== "B");
      const beforePrizes = Math.max(0, Math.round(revenue - tv - expectedTickets - base.membership - base.sponsorship));
      const prizesOutOfOtherIncome = Math.min(beforePrizes, Math.round(cupPrizes));
      const otherIncome = beforePrizes - prizesOutOfOtherIncome;
      const projected = tv + expectedTickets + base.membership + base.sponsorship + otherIncome + cupPrizes;
      for (const [id, wage] of wagesOf(squads.get(club.id) ?? [], base.wageBill / 12)) wages[id] = wage;
      const opening: ClubFinance = {
        cash: Math.round(Math.max(-base.netDebt, (OPENING_CASH_MONTHS_OF_REVENUE * revenue) / 12)),
        loans: 0,
        legacyDebt: Math.round(base.netDebt),
        wagesOwed: 0,
        lateWageMonths: 0,
        ticketPrice: price,
        baseCrowd: Math.round(baseCrowd),
        tv,
        sponsorship: Math.round(base.sponsorship),
        membership: Math.round(base.membership),
        membershipAnchor: Math.round(base.membership),
        otherIncome,
        infrastructure: Math.round(Math.max(MIN_INFRASTRUCTURE_SHARE_OF_REVENUE * projected, (1 - TRANSFER_SHARE_OF_REVENUE) * projected - base.wageBill)),
        expectedTickets,
        expectedPrizes: Math.round(cupPrizes),
        prizesOutOfOtherIncome,
        transferBudget: 0,
        wageCap: 0,
        recentPoints: [],
        month: { ...emptyLedger(), points: 0, games: 0 },
        season: emptyLedger(),
        lastSeason: null,
        lastClosing: null,
      };
      finances[club.id] = setBoardBudget(opening, base.wageBill / 12);
    }
  }
  return { economy, finances, wages };
}
