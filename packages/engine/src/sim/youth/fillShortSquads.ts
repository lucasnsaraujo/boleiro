import type { PositionGroup } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { isHumanClub } from "../coach/humanCoaches.js";
import { divisionOf, tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { academyPlayer, groupsToFill, MIN_SQUAD, professionalOf, readyProspect } from "../players/developPlayers.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { contractEnd } from "../transfers/expireContracts.js";
import { movePlayer, openDraft } from "../transfers/movePlayer.js";
import { REPLACEMENT_BAND, squadNeeds } from "../transfers/squadNeeds.js";
import type { PlayerMoved } from "../transfers/transferEvents.js";
import { wageRateOf } from "../transfers/wageDemand.js";
import type { Prospect } from "./academy.js";
import { firstWage } from "./moveProspect.js";

/** The kids a squad the market left short took up to have 18 players. */
export type SquadToppedUp = { type: "squadToppedUp"; clubId: string; playerIds: string[] };

// guess: a club this short re-signs a released player only when it can pay three months of his wage
// up front, as the market's own fillers must (signFreeAgents).
const UP_FRONT_MONTHS = 3;

const inventedPlayer = (kid: Omit<SimPlayer, "wage">, squad: readonly SimPlayer[]): SimPlayer => ({ ...kid, wage: firstWage(kid, squad) });

/**
 * Every squad the market left under 18 players (contracts that ran out at the turn of the year, sales)
 * fills each position it lacks: first, at an AI club, with the best free agent at or below its level
 * who it can pay and did not just let go itself, as clubs pick up released players; then with its academy's best teenager; then with an invented
 * Brazilian teenager where the academy has nobody. So every club can field a side. Draws from the
 * academies' own stream; a save from before academies waits for them to open.
 */
export function fillShortSquads(state: GameState): { state: GameState; events: (SquadToppedUp | PlayerMoved)[] } {
  if (!state.youth) return { state, events: [] };
  const squads = squadsByClub(state.players);
  const short = Object.values(state.clubs).filter((club) => (squads.get(club.id)?.length ?? 0) < MIN_SQUAD);
  if (!short.length) return { state, events: [] };
  const academies = new Map<string, Prospect[]>();
  for (const p of Object.values(state.youth.prospects)) academies.set(p.clubId, [...(academies.get(p.clubId) ?? []), p]);
  const freeAgents = new Map<PositionGroup, SimPlayer[]>();
  for (const p of Object.values(state.market.freeAgents)) freeAgents.set(p.group, [...(freeAgents.get(p.group) ?? []), p]);
  for (const list of freeAgents.values()) list.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));

  const random = randomStream(state.youth.rngState);
  const year = Number(state.date.slice(0, 4));
  const taken = new Set<string>();
  const events: (SquadToppedUp | PlayerMoved)[] = [];
  let next = openDraft(state);
  for (const club of short) {
    const squad = [...(squads.get(club.id) ?? [])];
    const { level } = squadNeeds(squad, tierOf(club));
    const rate = wageRateOf(squad);
    const playerIds: string[] = [];
    const isHuman = isHumanClub(state, club.id);
    groupsToFill(squad, []).forEach((group, i) => {
      const finance = next.finances[club.id];
      const canPay = (wage: number) => !!finance && finance.wagesOwed === 0 && finance.cash >= UP_FRONT_MONTHS * wage;
      // A human coach signs his own players; his club only takes up its kids.
      const signing = isHuman ? undefined : (freeAgents.get(group) ?? []).find((p) => !taken.has(p.id) && p.clubId !== club.id && p.strength <= level + REPLACEMENT_BAND.above && canPay(Math.max(1, rate(p.strength))));
      if (signing) {
        taken.add(signing.id);
        const moved = movePlayer(next, { playerId: signing.id, kind: "freeAgent", toClubId: club.id, fee: 0, contract: { wage: Math.max(1, rate(signing.strength)), until: contractEnd(year, random.next) } });
        next = moved.state;
        events.push(moved.event);
        squad.push(next.players[signing.id] ?? signing);
        return;
      }
      const prospect = readyProspect(academies.get(club.id) ?? [], group, taken);
      if (prospect) taken.add(prospect.id);
      const player = prospect
        ? professionalOf(prospect, club.id, firstWage(prospect, squad), state.date, random.next)
        : inventedPlayer(academyPlayer(`g${state.date}-${club.id}-${i}`, club.id, divisionOf(club), group, state.date, random.next), squad);
      next.players[player.id] = player;
      squad.push(player);
      playerIds.push(player.id);
    });
    if (playerIds.length) events.push({ type: "squadToppedUp", clubId: club.id, playerIds });
  }
  const prospects = Object.fromEntries(Object.entries(state.youth.prospects).filter(([id]) => !taken.has(id)));
  return { state: { ...next, youth: { ...state.youth, prospects, rngState: random.state() } }, events };
}
