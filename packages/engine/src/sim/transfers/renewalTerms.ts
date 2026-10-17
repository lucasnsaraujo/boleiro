import { addDays } from "../dates.js";
import { eventsOf } from "../events/eventMemory.js";
import type { GameState, IsoDate, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { coachMarketOf } from "./coachMarket.js";
import { CONTRACT_MONTHS, contractEndOn, contractTerms, preferredMonths, type ContractMonths, type ContractTerm, type TalkMood } from "./contractTerms.js";
import { goingRate } from "./wageDemand.js";

// guess: asking to leave counts against a renewal for a year.
const LEAVE_MEMORY_DAYS = 365;
// A contract's last year: from the day a year before it ends; with contracts to 31 December, from 1 January.
const LAST_YEAR_DAYS = 365;

/** Whether his contract ends within a year of `date`: the coach is warned, and his assistant looks at renewing him. */
export const isInLastContractYear = (player: Pick<SimPlayer, "contractUntil">, date: IsoDate): boolean => player.contractUntil < addDays(date, LAST_YEAR_DAYS);

/** A player's terms to stay at his club: the length he wants, what weighs on him, and his ask and stance for each length. */
export type RenewalTerms = { preferred: number; mood: TalkMood; terms: ContractTerm[] };

export type TalkState = Pick<GameState, "date" | "players" | "mood" | "market" | "eventMemory">;

/** The contract length closest to `years` (a half for six months), within the law's five years. */
export function contractMonthsOf(years: number): ContractMonths {
  const months = years * 12;
  return CONTRACT_MONTHS.reduce((best, length) => (Math.abs(length - months) < Math.abs(best - months) ? length : best));
}

/** The last day of his contract after a renewal of `months` signed on `date`: counted from the end of the one he has, within five years of `date`. */
export function renewedUntil(player: Pick<SimPlayer, "contractUntil">, date: IsoDate, months: number): IsoDate {
  return contractEndOn(date, months, player.contractUntil > date ? player.contractUntil : date);
}

/** What weighs on his talks today: his squad's morale, a request to leave in the last year, and a club's offer for him waiting. */
export function talkMoodOf(state: TalkState, player: Pick<SimPlayer, "id" | "clubId">): TalkMood {
  const bid = coachMarketOf(state).bids[player.id];
  return {
    morale: clubMood(state, player.clubId).squad,
    hasAskedToLeave: eventsOf(state, { typeId: "player-wants-out", playerId: player.id, since: addDays(state.date, -LEAVE_MEMORY_DAYS) }).length > 0,
    offerFrom: bid && bid.until >= state.date ? (bid.buyerId ?? "abroad") : null,
  };
}

/** His terms to renew with his club: around the club's going rate for his strength, never asking below what he earns. */
export function renewalTermsOf(state: TalkState, player: SimPlayer, squad: readonly SimPlayer[] = squadsOfGame(state).get(player.clubId) ?? []): RenewalTerms {
  const preferred = preferredMonths(player, squad);
  const mood = talkMoodOf(state, player);
  const anchor = Math.max(player.wage, goingRate(player.strength, squad));
  // A happy squad lowers every ask, but nobody signs on for less than he has.
  const terms = contractTerms(anchor, preferred, mood).map((term) => (term.wage < player.wage ? { ...term, wage: player.wage } : term));
  return { preferred, mood, terms };
}
