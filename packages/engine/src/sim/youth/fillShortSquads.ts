import { randomStream } from "../../engine/random.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { academyPlayer, groupsToFill, MIN_SQUAD, professionalOf, readyProspect, type YouthPromoted } from "../players/developPlayers.js";
import { squadsByClub } from "../players/squadsByClub.js";
import type { Prospect } from "./academy.js";
import { firstWage } from "./moveProspect.js";

/**
 * Every squad the market left under 18 players (contracts that ran out at the turn of the year, sales)
 * promotes its academy's best teenagers at the positions it lacks, and invented Brazilian teenagers where
 * the academy has nobody, so every club can field a side. Draws from the academies' own stream; a save
 * from before academies waits for them to open.
 */
export function fillShortSquads(state: GameState): { state: GameState; events: YouthPromoted[] } {
  if (!state.youth) return { state, events: [] };
  const squads = squadsByClub(state.players);
  const short = Object.values(state.clubs).filter((club) => (squads.get(club.id)?.length ?? 0) < MIN_SQUAD);
  if (!short.length) return { state, events: [] };
  const academies = new Map<string, Prospect[]>();
  for (const p of Object.values(state.youth.prospects)) academies.set(p.clubId, [...(academies.get(p.clubId) ?? []), p]);
  const random = randomStream(state.youth.rngState);
  const taken = new Set<string>();
  const joined: Record<string, SimPlayer> = {};
  const events: YouthPromoted[] = [];
  for (const club of short) {
    const squad = squads.get(club.id) ?? [];
    groupsToFill(squad, []).forEach((group, i) => {
      const prospect = readyProspect(academies.get(club.id) ?? [], group, taken);
      if (prospect) taken.add(prospect.id);
      const invented = prospect ? null : academyPlayer(`g${state.date}-${club.id}-${i}`, club.id, club.division, group, state.date, random.next);
      const player = prospect ? professionalOf(prospect, club.id, firstWage(prospect, squad), state.date, random.next) : invented && { ...invented, wage: firstWage(invented, squad) };
      if (!player) return;
      joined[player.id] = player;
      events.push({ type: "youthPromoted", playerId: player.id, clubId: club.id });
    });
  }
  const prospects = Object.fromEntries(Object.entries(state.youth.prospects).filter(([id]) => !taken.has(id)));
  return { state: { ...state, players: { ...state.players, ...joined }, youth: { ...state.youth, prospects, rngState: random.state() } }, events };
}
