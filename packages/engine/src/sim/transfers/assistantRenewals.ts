import { doesAssistantHandle } from "../coach/assistantDuties.js";
import { tierOf } from "../finances/tierOf.js";
import type { ClubFinance, GameState, IsoDate, SimPlayer, Tier } from "../gameState.js";
import { squadsOfGame, withReplacedPlayers } from "../players/squadsByClub.js";
import { boardRefusal } from "./boardRefusal.js";
import { standingRenewalCounter } from "./coachMarket.js";
import { assistantPick, type ContractTerm } from "./contractTerms.js";
import { isInLastContractYear, renewalTermsOf, renewedUntil, type TalkState } from "./renewalTerms.js";
import { SQUAD_TARGET } from "./squadNeeds.js";
import type { PlayerContractRenewed, RenewalSkipped, RenewalSkipReason } from "./transferEvents.js";
import { transferWindowsOf } from "./transferWindows.js";
import { wageBillsOf } from "./wageBillsOf.js";
import { compareText } from "../compareText.js";

// guess: a club keeps the players inside its usual squad size (SQUAD_TARGET) who are under 34.
const RENEWAL_MAX_AGE = 34;
// guess: the assistant looks at the contracts at the end of each window, while the club can still replace
// whoever leaves, and on the season's last day, before the year's contracts run out.
const SEASON_LAST_DAY = "12-31";

/** Whether `date` is a season's last day, when contracts to the end of the season are talked over. */
export const isSeasonLastDay = (date: IsoDate): boolean => date.slice(5) === SEASON_LAST_DAY;

/** Whether the club wants to keep him: among its usual squad size by strength, and under 34. */
export function isWorthKeeping(player: Pick<SimPlayer, "strength" | "age">, squad: readonly Pick<SimPlayer, "strength">[], tier: Tier): boolean {
  return squad.filter((p) => p.strength > player.strength).length < SQUAD_TARGET[tier] && player.age < RENEWAL_MAX_AGE;
}

/** The days of the year ("MM-DD") the assistant looks at the contracts, in order. */
function reviewDaysOf(game: Pick<GameState, "hasMidSeasonWindow">): string[] {
  return [...transferWindowsOf(game).map((w) => w.closes), SEASON_LAST_DAY].sort();
}

/** The first day after `date` the assistant looks at the contracts. */
export function nextAssistantReview(game: Pick<GameState, "hasMidSeasonWindow">, date: IsoDate): IsoDate {
  const days = reviewDaysOf(game);
  const later = days.find((day) => day > date.slice(5));
  return later ? `${date.slice(0, 4)}-${later}` : `${Number(date.slice(0, 4)) + 1}-${days[0] ?? SEASON_LAST_DAY}`;
}

/** What the assistant does about a player in his last year: renew him on the length he agrees to nearest two years, or why not. */
export type AssistantVerdict = { kind: "renew"; term: ContractTerm } | { kind: "skip"; reason: RenewalSkipReason };

/** The assistant's verdict on renewing `player` with a club whose wage bill is `bill` and whose board has `finance`. */
export function assistantVerdict(state: TalkState, player: SimPlayer, squad: readonly SimPlayer[], tier: Tier, finance: ClubFinance, bill: number): AssistantVerdict {
  if (!isWorthKeeping(player, squad, tier)) return { kind: "skip", reason: "notInPlans" };
  const term = assistantPick(renewalTermsOf(state, player, squad).terms);
  if (!term) return { kind: "skip", reason: "playerUnwilling" };
  if (boardRefusal(finance, bill, { upFront: 0, wageChange: term.wage - player.wage })) return { kind: "skip", reason: "wageCap" };
  return { kind: "renew", term };
}

/** The coach's players the assistant looks at: in their last year, his own, tied to no loan or pre-contract, and not playing their announced last season. */
export function renewalCandidates(state: Pick<GameState, "date" | "market">, squad: readonly SimPlayer[]): SimPlayer[] {
  return squad
    .filter((p) => isInLastContractYear(p, state.date) && !state.market.loans[p.id] && !state.market.preContracts[p.id] && !p.retiring)
    .sort((a, b) => b.strength - a.strength || compareText(a.id, b.id));
}

/**
 * On the days he looks (each window's last day and the season's last day), the seated coach's assistant
 * renews the players worth keeping in their last year, the strongest first, while the wage cap has room,
 * and says what he left. A player outside the plans is named at the last look before his contract ends.
 */
export function assistantRenewals(state: GameState): { state: GameState; events: (PlayerContractRenewed | RenewalSkipped)[] } {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance || !reviewDaysOf(state).includes(state.date.slice(5)) || !doesAssistantHandle(state.coach, "contracts")) return { state, events: [] };
  const squad = squadsOfGame(state).get(clubId) ?? [];
  const tier = tierOf(state.clubs[clubId] ?? { division: null });
  const nextLook = nextAssistantReview(state, state.date);
  let bill = wageBillsOf(state).get(clubId) ?? 0;
  const renewed: SimPlayer[] = [];
  const events: (PlayerContractRenewed | RenewalSkipped)[] = [];
  for (const player of renewalCandidates(state, squad)) {
    // The coach is talking to him himself.
    if (standingRenewalCounter(state, player.id)) continue;
    const verdict = assistantVerdict(state, player, squad, tier, finance, bill);
    if (verdict.kind === "skip") {
      if (verdict.reason !== "notInPlans" || nextLook > player.contractUntil) events.push({ type: "renewalSkipped", playerId: player.id, clubId, until: player.contractUntil, reason: verdict.reason });
      continue;
    }
    const { months, wage } = verdict.term;
    const until = renewedUntil(player, state.date, months);
    bill += wage - player.wage;
    renewed.push({ ...player, wage, contractUntil: until });
    events.push({ type: "playerContractRenewed", playerId: player.id, clubId, until, wage, byAssistant: true });
  }
  return { state: renewed.length ? { ...state, players: withReplacedPlayers(state.players, renewed) } : state, events };
}
