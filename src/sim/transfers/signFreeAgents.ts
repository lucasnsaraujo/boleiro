import type { PositionGroup } from "../../engine/match.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { boardRefusal } from "./boardRefusal.js";
import { contractEnd } from "./expireContracts.js";
import { marketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import { REPLACEMENT_BAND, SQUAD_TARGET, squadNeeds } from "./squadNeeds.js";
import { MIN_SQUAD } from "./tradeBetweenClubs.js";
import type { PlayerMoved } from "./transferEvents.js";
import { wageRateOf } from "./wageDemand.js";
import { willingToJoin } from "./willingToJoin.js";

// guess: a club tries up to fifteen free agents a market day.
const TRIES = 15;
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

/**
 * One market day of AI clubs below their usual squad size signing free agents near their level at the club's going rate,
 * no fee, within board limits.
 */
export function signFreeAgents(state: GameState, random: () => number): { state: GameState; events: PlayerMoved[] } {
  const events: PlayerMoved[] = [];
  let next = state;
  const year = Number(state.date.slice(0, 4));
  const view = marketView(next);
  const signed = new Set<string>();
  const byGroup = new Map<PositionGroup, SimPlayer[]>(GROUPS.map((g) => [g, []]));
  for (const p of Object.values(state.market.freeAgents)) byGroup.get(p.group)?.push(p);
  for (const list of byGroup.values()) list.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  for (const clubId of Object.keys(state.finances).sort()) {
    if (clubId === state.coachClubId) continue;
    const club = next.clubs[clubId];
    const finance = next.finances[clubId];
    if (!club || !finance) continue;
    for (let size = view.squad(clubId).length; size < SQUAD_TARGET[view.tier(clubId)]; size++) {
      const squad = view.squad(clubId);
      const { level, thinnest } = squadNeeds(squad, view.tier(clubId));
      const rate = wageRateOf(squad);
      const medianWage = [...squad.map((p) => p.wage)].sort((a, b) => a - b)[squad.length >> 1] ?? 0;
      // Only free agents near the club's level; below that it waits for its own youth.
      const candidates = (byGroup.get(thinnest) ?? [])
        .filter((p) => !signed.has(p.id) && p.strength <= level + REPLACEMENT_BAND.above && p.strength >= level - REPLACEMENT_BAND.below)
        .slice(0, TRIES);
      const signing = candidates.find((p: SimPlayer) => {
        const wage = Math.max(1, rate(p.strength));
        // guess: the board lets a short squad sign a free agent paid no more than its median wage, and
        // a squad too thin to name a matchday squad sign anyone, whatever its limits.
        const filler = squad.length < MIN_SQUAD || wage <= medianWage;
        const refused = filler ? null : boardRefusal(next.finances[clubId] ?? finance, view.bill(clubId), { upFront: 3 * wage, wageChange: wage });
        const from = view.tier(p.clubId);
        return !refused && random() < willingToJoin({ player: p, from, to: { tier: view.tier(clubId), fanbase: club.fanbase }, wage, unemployed: true });
      });
      if (!signing) break;
      signed.add(signing.id);
      const wage = Math.max(1, rate(signing.strength));
      const moved = movePlayer(next, { playerId: signing.id, kind: "freeAgent", toClubId: clubId, fee: 0, contract: { wage, until: contractEnd(year, random) } });
      next = moved.state;
      events.push(moved.event);
      view.record(null, next.players[signing.id] ?? null);
    }
  }
  return { state: next, events };
}
