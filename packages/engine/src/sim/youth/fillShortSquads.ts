import type { PositionGroup } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { isHumanClub } from "../coach/humanCoaches.js";
import { divisionOf, tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { academyPlayer, groupsToFill, isNearSquadMiddle, MIN_SQUAD, professionalOf, readyProspect } from "../players/developPlayers.js";
import { forgetSquads, squadsOfGame } from "../players/squadsByClub.js";
import { contractEnd } from "../transfers/expireContracts.js";
import { movePlayer, openDraft } from "../transfers/movePlayer.js";
import { REPLACEMENT_BAND, squadNeeds } from "../transfers/squadNeeds.js";
import type { PlayerMoved } from "../transfers/transferEvents.js";
import { wageRateOf } from "../transfers/wageDemand.js";
import type { Prospect } from "./academy.js";
import { firstWage } from "./moveProspect.js";
import { compareText } from "../compareText.js";
import { homeNationalityOf } from "../players/homeNationality.js";

/** The kids a squad the market left short took up to have 18 players. */
export type SquadToppedUp = { type: "squadToppedUp"; clubId: string; playerIds: string[] };

const inventedPlayer = (kid: Omit<SimPlayer, "wage">, squad: readonly SimPlayer[]): SimPlayer => ({ ...kid, wage: firstWage(kid, squad) });

/**
 * Every squad the market left under 18 players (contracts that ran out at the turn of the year, sales)
 * fills each position it lacks: first, at an AI club, with the best free agent up to a little above the
 * middle of its squad (REPLACEMENT_BAND) it did not just let go itself, as clubs pick up released players;
 * then with its academy's best teenager, at an AI club only one who plays near the middle of its squad
 * (isNearSquadMiddle); then with an invented teenager of the club's country at its level. So every club can field a side. Draws from the
 * academies' own stream; a save from before academies waits for them to open.
 */
export function fillShortSquads(state: GameState): { state: GameState; events: (SquadToppedUp | PlayerMoved)[] } {
  if (!state.youth) return { state, events: [] };
  const squads = squadsOfGame(state);
  const short = Object.values(state.clubs).filter((club) => (squads.get(club.id)?.length ?? 0) < MIN_SQUAD);
  if (!short.length) return { state, events: [] };
  const academies = new Map<string, Prospect[]>();
  for (const p of Object.values(state.youth.prospects)) academies.set(p.clubId, [...(academies.get(p.clubId) ?? []), p]);
  const freeAgents = new Map<PositionGroup, SimPlayer[]>();
  for (const p of Object.values(state.market.freeAgents)) freeAgents.set(p.group, [...(freeAgents.get(p.group) ?? []), p]);
  for (const list of freeAgents.values()) list.sort((a, b) => b.strength - a.strength || compareText(a.id, b.id));

  const random = randomStream(state.youth.rngState);
  const year = Number(state.date.slice(0, 4));
  const taken = new Set<string>();
  const events: (SquadToppedUp | PlayerMoved)[] = [];
  let next = openDraft(state);
  for (const club of short) {
    const squad = [...(squads.get(club.id) ?? [])];
    const { middle } = squadNeeds(squad, tierOf(club));
    const rate = wageRateOf(squad);
    const playerIds: string[] = [];
    const isHuman = isHumanClub(state, club.id);
    groupsToFill(squad, []).forEach((group, i) => {
      // A human coach signs his own players; his club only takes up its kids. An AI club this short signs
      // even without cash in hand: a teenager taken up instead would earn the same going rate.
      const signing = isHuman ? undefined : (freeAgents.get(group) ?? []).find((p) => !taken.has(p.id) && p.clubId !== club.id && p.strength <= middle + REPLACEMENT_BAND.above);
      if (signing) {
        taken.add(signing.id);
        const moved = movePlayer(next, { playerId: signing.id, kind: "freeAgent", toClubId: club.id, fee: 0, contract: { wage: Math.max(1, rate(signing.strength)), until: contractEnd(year, random.next) } });
        next = moved.state;
        events.push(moved.event);
        squad.push(next.players[signing.id] ?? signing);
        return;
      }
      const prospect = readyProspect(academies.get(club.id) ?? [], group, taken, (kid) => isHuman || isNearSquadMiddle(kid, squad));
      if (prospect) taken.add(prospect.id);
      const player = prospect
        ? professionalOf(prospect, club.id, firstWage(prospect, squad), state.date, random.next, homeNationalityOf(club))
        : inventedPlayer(academyPlayer(`g${state.date}-${club.id}-${i}`, club.id, divisionOf(club), group, state.date, random.next, homeNationalityOf(club)), squad);
      forgetSquads(next.players);
      next.players[player.id] = player;
      squad.push(player);
      playerIds.push(player.id);
    });
    if (playerIds.length) events.push({ type: "squadToppedUp", clubId: club.id, playerIds });
  }
  const prospects = Object.fromEntries(Object.entries(state.youth.prospects).filter(([id]) => !taken.has(id)));
  return { state: { ...next, youth: { ...state.youth, prospects, rngState: random.state() } }, events };
}
