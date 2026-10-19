import type { PositionGroup } from "@boleiro/engine/engine/match";
import { doesAssistantHandle } from "@boleiro/engine/sim/coach/assistantDuties";
import { addDays, daysBetween } from "@boleiro/engine/sim/dates";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import type { GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { squadsOfGame } from "@boleiro/engine/sim/players/squadsByClub";
import { assistantVerdict, nextAssistantReview, renewalCandidates } from "@boleiro/engine/sim/transfers/assistantRenewals";
import { standingRenewalCounter } from "@boleiro/engine/sim/transfers/coachMarket";
import { assistantPick, contractTerms, NEUTRAL_TALKS, preferredMonths, type ContractMonths, type ContractTerm, type TalkMood } from "@boleiro/engine/sim/transfers/contractTerms";
import { releaseClauseOf } from "@boleiro/engine/sim/transfers/releaseClause";
import { isInLastContractYear, renewalTermsOf, renewedUntil } from "@boleiro/engine/sim/transfers/renewalTerms";
import type { RenewalSkipReason } from "@boleiro/engine/sim/transfers/transferEvents";
import type { RenewalCounter } from "@boleiro/engine/sim/transfers/transferMarket";
import { isInPreContractWindow, PRE_CONTRACT_DAYS } from "@boleiro/engine/sim/transfers/tradeBetweenClubs";
import { wageBillsOf } from "@boleiro/engine/sim/transfers/wageBillsOf";
import { compareText } from "@boleiro/engine/sim/compareText";

export type ContractsState = Pick<GameState, "date" | "coachClubId" | "coach" | "clubs" | "players" | "finances" | "market" | "mood" | "eventMemory" | "hasMidSeasonWindow">;

/** What the coach's assistant will do about a contract, and on which day he looks at it. */
export type AssistantPlan = { kind: "renews"; on: IsoDate; months: ContractMonths; wage: number } | { kind: "skips"; on: IsoDate; reason: RenewalSkipReason };

/** One of the coach's players in the last year of his contract. */
export type ContractRow = {
  playerId: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  wage: number;
  until: IsoDate;
  /** Other clubs may already sign him to a pre-contract. */
  isPreContractOpen: boolean;
  /** The club he signed a pre-contract with, if any. */
  leavesForId: string | null;
  /** null when the coach runs contracts himself, or the assistant has no look left before the contract ends. */
  plan: AssistantPlan | null;
};

/** One contract length on the renewal screen. */
export type RenewalOption = ContractTerm & {
  until: IsoDate;
  /** His age when it ends. */
  ageAtEnd: number;
  /** The wage times the months it adds. */
  total: number;
  billAfter: number;
  clauseAfter: number;
  isAssistantPick: boolean;
};

/** Everything the renewal screen shows about one of the coach's players. */
export type RenewalSheet = {
  playerId: string;
  wage: number;
  until: IsoDate;
  /** The first day other clubs may sign him to a pre-contract. */
  preContractFrom: IsoDate;
  isPreContractOpen: boolean;
  preferredMonths: number;
  mood: TalkMood;
  options: RenewalOption[];
  bill: number;
  wageCap: number;
  clause: number;
  /** His counter to the coach's last offer, while it stands. */
  counter: RenewalCounter | null;
  /** Whether the assistant runs contracts, and what he'll do about this one. */
  isAssistantOn: boolean;
  plan: AssistantPlan | null;
};

const coachSquad = (state: ContractsState): SimPlayer[] => (state.coachClubId ? [...(squadsOfGame(state).get(state.coachClubId) ?? [])] : []);
const yearsBetween = (from: IsoDate, to: IsoDate) => daysBetween(from, to) / 365.25;

/** The assistant's plan for a player: his verdict today, on the first day he looks while the contract is in its last year. */
function planOf(state: ContractsState, player: SimPlayer, squad: readonly SimPlayer[]): AssistantPlan | null {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance || !doesAssistantHandle(state.coach, "contracts")) return null;
  let on = nextAssistantReview(state, state.date);
  while (!isInLastContractYear(player, on)) on = nextAssistantReview(state, on);
  if (on > player.contractUntil) return null;
  const verdict = assistantVerdict(state, player, squad, tierOf(state.clubs[clubId] ?? { division: null }), finance, wageBillsOf(state).get(clubId) ?? 0);
  return verdict.kind === "renew" ? { kind: "renews", on, months: verdict.term.months, wage: verdict.term.wage } : { kind: "skips", on, reason: verdict.reason };
}

/** The coach's players in the last year of their contract, the soonest to end first. */
export function contractsEnding(state: ContractsState): ContractRow[] {
  const squad = coachSquad(state);
  const leaving = squad.filter((p) => isInLastContractYear(p, state.date) && !state.market.loans[p.id] && state.market.preContracts[p.id]);
  const rows = [...renewalCandidates(state, squad), ...leaving].map((p) => ({
    playerId: p.id,
    name: p.name,
    group: p.group,
    age: p.age,
    strength: p.strength,
    wage: p.wage,
    until: p.contractUntil,
    isPreContractOpen: isInPreContractWindow(p, state.date),
    leavesForId: state.market.preContracts[p.id] ?? null,
    plan: state.market.preContracts[p.id] ? null : planOf(state, p, squad),
  }));
  return rows.sort((a, b) => compareText(a.until, b.until) || b.strength - a.strength || compareText(a.playerId, b.playerId));
}

/** The renewal screen of one of the coach's players; null for anyone else, or one on loan. */
export function renewalSheet(state: ContractsState, playerId: string): RenewalSheet | null {
  const player = state.players[playerId];
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!player || !clubId || !finance || player.clubId !== clubId || state.market.loans[playerId]) return null;
  const squad = coachSquad(state);
  const tier = tierOf(state.clubs[clubId] ?? { division: null });
  const { preferred, mood, terms } = renewalTermsOf(state, player, squad);
  const pick = assistantPick(terms);
  const bill = wageBillsOf(state).get(clubId) ?? 0;
  const options = terms.map((term) => {
    const until = renewedUntil(player, state.date, term.months);
    const billAfter = bill - player.wage + term.wage;
    return {
      ...term,
      until,
      ageAtEnd: Math.floor(player.age + yearsBetween(state.date, until)),
      total: term.wage * term.months,
      billAfter,
      clauseAfter: releaseClauseOf({ ...player, wage: term.wage }, tier, state.market.eurBrl),
      isAssistantPick: term === pick,
    };
  });
  return {
    playerId,
    wage: player.wage,
    until: player.contractUntil,
    preContractFrom: addDays(player.contractUntil, -PRE_CONTRACT_DAYS),
    isPreContractOpen: isInPreContractWindow(player, state.date),
    preferredMonths: preferred,
    mood,
    options,
    bill,
    wageCap: finance.wageCap,
    clause: releaseClauseOf(player, tier, state.market.eurBrl),
    counter: standingRenewalCounter(state, playerId),
    isAssistantOn: doesAssistantHandle(state.coach, "contracts"),
    plan: planOf(state, player, squad),
  };
}

/** What a player at another club or without one asks to join the coach's club for each length, around `wage`, the wage he wants for the length he wants. */
export function signingTerms(state: Pick<GameState, "coachClubId" | "players" | "market">, playerId: string, wage: number): ContractTerm[] {
  const player = state.players[playerId] ?? state.market.freeAgents[playerId];
  if (!player) return [];
  const squad = state.coachClubId ? (squadsOfGame(state).get(state.coachClubId) ?? []) : [];
  return contractTerms(wage, preferredMonths(player, squad), NEUTRAL_TALKS);
}

