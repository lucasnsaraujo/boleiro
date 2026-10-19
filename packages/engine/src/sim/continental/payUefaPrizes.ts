import { bookMoneyInDraft } from "../finances/bookMoney.js";
import type { PrizePaid } from "../finances/payCopaPrizes.js";
import type { GameState } from "../gameState.js";
import type { UefaCup } from "../world/uefaPlaces.js";
import { cupChampion, leaguePhaseMatches, leaguePhaseTable, superCupWinner, type EuropeanCups, type KnockoutRoundName, type LeaguePhaseCup } from "./uefaCups.js";

type CupPrizes = {
  /** The league phase's starting fee. */
  start: number;
  win: number;
  draw: number;
  /** One share of the league-phase ranking bonus: the 36th gets one, each place above one more. */
  rankShare: number;
  top8: number;
  top16: number;
  /** One share of the value pillar, its European and non-European parts together, on the same 1-to-36 scale. */
  valueShare: number;
  /** For reaching each knockout round. */
  rounds: Record<KnockoutRoundName, number>;
  winner: number;
};

// UEFA's 2026/27 distribution in euros, circular 48/2026 of 13 July 2026 (the 2024–27 cycle's figures, the same as
// 2025/26's): https://www.ksi.is/api/download/media/e1wixrnh/20260713_circular_2026_48_en-1.pdf. The game has no
// Conference League and no qualifying rounds, so neither's money is paid.
const PRIZES: Record<UefaCup, CupPrizes> = {
  "champions-league": {
    start: 18_620_000,
    win: 2_100_000,
    draw: 700_000,
    rankShare: 275_000,
    top8: 2_000_000,
    top16: 1_000_000,
    valueShare: 935_000 + 346_000,
    rounds: { playoffs: 1_000_000, "round-of-16": 11_000_000, "quarter-finals": 12_500_000, "semi-finals": 15_000_000, final: 18_500_000 },
    winner: 6_500_000,
  },
  "europa-league": {
    start: 4_310_000,
    win: 450_000,
    draw: 150_000,
    rankShare: 75_000,
    top8: 600_000,
    top16: 300_000,
    valueShare: 217_000 + 80_000,
    rounds: { playoffs: 300_000, "round-of-16": 1_750_000, "quarter-finals": 2_500_000, "semi-finals": 4_200_000, final: 7_000_000 },
    winner: 6_000_000,
  },
};
// The same circular: each Super Cup club €4m, its winner €1m more.
const SUPER_CUP = { each: 4_000_000, winner: 1_000_000 };
// The real league phase plays eight matches a club.
const LEAGUE_PHASE_MATCHES = 8;
const UNPLAYED = "-";

/**
 * The cup's prizes earned between `before` (null for a season opened today) and `after`, in euros by club.
 * guess: the value pillar ranks the 36 clubs by the game's seeding, their best elevens, where UEFA ranks them by
 * club coefficients and their country's media market; it is paid with the starting fee on the first matchday.
 * guess: a format playing fewer matchdays pays each result for the real matches it stands for, and the draws a
 * league phase saves are not handed back through the ranking shares.
 */
function cupPrizes(before: LeaguePhaseCup | null, after: LeaguePhaseCup, pay: (clubId: string, eur: number) => void): void {
  const prizes = PRIZES[after.cup];
  const wasPlayed = (i: number) => before !== null && before.results[2 * i] !== UNPLAYED;
  const matches = leaguePhaseMatches(after);
  const scale = after.dates.length ? LEAGUE_PHASE_MATCHES / after.dates.length : 1;
  const isOpened = (cup: LeaguePhaseCup | null) => cup !== null && cup.results[0] !== UNPLAYED;
  if (!isOpened(before) && isOpened(after)) {
    after.clubIds.forEach((clubId, seed) => pay(clubId, prizes.start + prizes.valueShare * (after.clubIds.length - seed)));
  }
  matches.forEach(({ homeId, awayId, result }, i) => {
    if (!result || wasPlayed(i)) return;
    if (result.homeGoals === result.awayGoals) {
      pay(homeId, prizes.draw * scale);
      pay(awayId, prizes.draw * scale);
    } else pay(result.homeGoals > result.awayGoals ? homeId : awayId, prizes.win * scale);
  });
  const isPhaseDone = (cup: LeaguePhaseCup | null) => cup !== null && !cup.results.includes(UNPLAYED);
  if (!isPhaseDone(before) && isPhaseDone(after)) {
    leaguePhaseTable(after).forEach((clubId, i) => {
      const place = i + 1;
      pay(clubId, prizes.rankShare * (after.clubIds.length + 1 - place) + (place <= 8 ? prizes.top8 : place <= 16 ? prizes.top16 : 0));
    });
  }
  for (const round of after.knockout.slice(before?.knockout.length ?? 0)) for (const clubId of round.ties.flat()) pay(clubId, prizes.rounds[round.name]);
  const champion = cupChampion(after);
  if (champion && !(before && cupChampion(before))) pay(champion, prizes.winner);
}

/**
 * Pays UEFA's prizes for what the day changed in its cups (`before` → the game's `europe`), in BRL at today's
 * euro, to every club with books, the human coaches' and the AI's of a league abroad in the full tier: the
 * starting fee and value share as the league phase opens, each league-phase win and draw, the ranking bonus
 * once it ends, each knockout round reached and the winner's bonus, and the Super Cup's to both clubs and its
 * winner. A result-only club keeps no books, so it gets none.
 */
export function payUefaPrizes(state: GameState, before: EuropeanCups | undefined): { state: GameState; events: PrizePaid[] } {
  const after = state.europe;
  if (!after || after === before) return { state, events: [] };
  const finances = { ...state.finances };
  const events: PrizePaid[] = [];
  const payer = (competitionId: string) => (clubId: string, eur: number) => {
    const amount = Math.round(eur * state.market.eurBrl);
    if (!finances[clubId] || amount <= 0) return;
    bookMoneyInDraft(finances, clubId, { revenue: "prizes", amount });
    events.push({ type: "prizePaid", clubId, competitionId, amount });
  };
  for (const cup of after.cups) {
    const was = before?.cups.find((c) => c.cup === cup.cup && c.season === cup.season) ?? null;
    if (was !== cup) cupPrizes(was, cup, payer(`${cup.cup}-${cup.season}`));
  }
  const superCup = after.superCup;
  const wasSuperCup = before?.superCup?.season === superCup?.season ? before?.superCup : null;
  const winnerId = superCupWinner(superCup);
  if (superCup && winnerId && !superCupWinner(wasSuperCup ?? null)) {
    const pay = payer(`uefa-super-cup-${superCup.season}`);
    for (const clubId of superCup.clubIds) pay(clubId, SUPER_CUP.each + (clubId === winnerId ? SUPER_CUP.winner : 0));
  }
  return events.length ? { state: { ...state, finances }, events } : { state, events };
}
