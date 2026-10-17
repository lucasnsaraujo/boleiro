import type { Formation } from "@boleiro/engine/engine/formations";
import { chemistryOf } from "@boleiro/engine/sim/chemistry/chemistryOf";
import { assistantCandidates, assistantOf, assistantReadOf, readErrorAt, scoutSharpeningAt, type Assistant, type AssistantCandidate } from "@boleiro/engine/sim/coach/assistant";
import { doesAssistantHandle, type AssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import { weakestSpot, type WeakSpot } from "@boleiro/engine/sim/coach/assistantTips";
import { doesAssistantPriceTickets } from "@boleiro/engine/sim/finances/setTicketPrice";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { squadsOfGame } from "@boleiro/engine/sim/players/squadsByClub";
import { assistantVerdict, nextAssistantReview, renewalCandidates } from "@boleiro/engine/sim/transfers/assistantRenewals";
import { wageBillsOf } from "@boleiro/engine/sim/transfers/wageBillsOf";

/** A contract the assistant will renew on his next look, if the coach leaves it to him. */
export type PlannedRenewal = { playerId: string; name: string; contractUntil: IsoDate; months: number };

/**
 * The assistant's screen for the coach in the seat: who his assistant is and how far off his reads are
 * (strength points, and stars sharper than the scouts on the kids), the areas he runs, who could replace
 * him, and, with a club, his tip on the weakest starter, the formation and captain he would pick, and
 * the renewals he plans for his next look at the contracts.
 */
export type AssistantPage = {
  assistant: Assistant;
  readError: number;
  starsSharper: number;
  duties: Record<AssistantDuty, boolean>;
  candidates: AssistantCandidate[];
  tip: WeakSpot | null;
  formation: Formation;
  captainName: string | null;
  renewals: PlannedRenewal[];
  nextReview: IsoDate;
};

export function assistantPage(state: GameState): AssistantPage {
  const assistant = assistantOf(state);
  const clubId = state.coachClubId;
  const { coach } = state;
  const duties: Record<AssistantDuty, boolean> = {
    lineup: doesAssistantHandle(coach, "lineup"),
    contracts: doesAssistantHandle(coach, "contracts"),
    youth: doesAssistantHandle(coach, "youth"),
    ticketPrice: doesAssistantPriceTickets(state),
    selling: doesAssistantHandle(coach, "selling"),
  };
  const formation = coach.tactics.formation;
  const base = {
    assistant,
    readError: readErrorAt(assistant.level),
    starsSharper: scoutSharpeningAt(assistant.level),
    duties,
    candidates: assistantCandidates(state),
    formation,
    nextReview: nextAssistantReview(state, state.date),
  };
  if (!clubId) return { ...base, tip: null, captainName: null, renewals: [] };
  const tip = weakestSpot(state, clubId, formation, assistantReadOf(state, assistant));
  const captain = chemistryOf(state, clubId).captain;
  const squad = squadsOfGame(state).get(clubId) ?? [];
  const finance = state.finances[clubId];
  const bill = wageBillsOf(state).get(clubId) ?? 0;
  const tier = tierOf(state.clubs[clubId] ?? { division: null });
  const renewals = finance && duties.contracts
    ? renewalCandidates(state, squad).flatMap((player): PlannedRenewal[] => {
        const verdict = assistantVerdict(state, player, squad, tier, finance, bill);
        return verdict.kind === "renew" ? [{ playerId: player.id, name: player.name, contractUntil: player.contractUntil, months: verdict.term.months }] : [];
      })
    : [];
  return { ...base, tip, captainName: captain ? (state.players[captain.playerId]?.name ?? null) : null, renewals };
}
