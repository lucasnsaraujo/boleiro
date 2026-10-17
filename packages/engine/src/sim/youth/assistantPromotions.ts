import { doesAssistantHandle } from "../coach/assistantDuties.js";
import { asWaitingCoach, waitingCoachesOf } from "../coach/humanCoaches.js";
import type { GameState } from "../gameState.js";
import type { YouthPromoted } from "../players/developPlayers.js";
import { isMarketDay } from "../transfers/transferWindows.js";
import { isWorthPromoting, promoteProspect } from "./moveProspect.js";

/** On a market day, the seated coach's assistant promotes each kid of his academy the club would keep, if he runs the youth. */
function promoteReady(state: GameState): { state: GameState; events: YouthPromoted[] } {
  const clubId = state.coachClubId;
  if (!clubId || !state.youth || !doesAssistantHandle(state.coach, "youth")) return { state, events: [] };
  let next = state;
  const events: YouthPromoted[] = [];
  const kids = Object.values(state.youth.prospects).filter((p) => p.clubId === clubId).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  for (const kid of kids) {
    const squad = Object.values(next.players).filter((p) => p.clubId === clubId);
    if (!isWorthPromoting(next, kid, squad)) continue;
    const promoted = promoteProspect(next, kid.id);
    if (promoted.refusal) continue;
    next = promoted.state;
    events.push({ type: "youthPromoted", playerId: kid.id, clubId });
  }
  return { state: next, events };
}

/**
 * The assistants who run their coach's youth promote the kids ready for the squad on each market day:
 * the seated coach's, then each waiting hot-seat coach's, whose promotions come back apart in waiting order.
 */
export function assistantPromotions(state: GameState): { state: GameState; events: YouthPromoted[]; waitingEvents: YouthPromoted[][] } {
  if (!isMarketDay(state, state.date)) return { state, events: [], waitingEvents: waitingCoachesOf(state).map(() => []) };
  const seated = promoteReady(state);
  let next = seated.state;
  const waitingEvents: YouthPromoted[][] = [];
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    const own = asWaitingCoach(next, index, promoteReady);
    next = own.state;
    waitingEvents.push(own.events);
  }
  return { state: next, events: seated.events, waitingEvents };
}
