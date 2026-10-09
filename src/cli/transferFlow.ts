import { advanceDay } from "../sim/advanceDay.js";
import { tierOf } from "../sim/finances/tierOf.js";
import type { GameState, Tier } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import type { MoveKind } from "../sim/transfers/transferEvents.js";
import { isBrazilian } from "../sim/transfers/willingToJoin.js";

export type SeasonFlow = {
  season: number;
  toEurope: number;
  fromAbroad: number;
  domestic: number;
  freeAgents: number;
  preContracts: number;
  loans: number;
  /** Share of each tier's players who are not Brazilian, at the end of the season. */
  foreignShare: Record<Tier, number>;
};
export type TopTransfer = { season: number; name: string; kind: MoveKind; from: string | null; to: string | null; fee: number };

function foreignShare(state: GameState): Record<Tier, number> {
  const counts: Record<Tier, [foreign: number, all: number]> = { A: [0, 0], B: [0, 0], C: [0, 0], D: [0, 0], state: [0, 0] };
  for (const p of Object.values(state.players)) {
    const club = state.clubs[p.clubId];
    if (!club) continue;
    const count = counts[tierOf(club)];
    count[1]++;
    if (!isBrazilian(p.nationalities)) count[0]++;
  }
  const share = ([foreign, all]: [number, number]) => (all ? foreign / all : 0);
  return { A: share(counts.A), B: share(counts.B), C: share(counts.C), D: share(counts.D), state: share(counts.state) };
}

/** Plays `seasons` whole seasons with no coach and counts each season's transfers by kind, plus the biggest fees. */
export function transferFlow(seed: number, seasons: number): { flows: SeasonFlow[]; top: TopTransfer[] } {
  let state = loadNewGame(seed, { coachClubId: null });
  const flows: SeasonFlow[] = [];
  const top: TopTransfer[] = [];
  const lastSeason = state.season + seasons - 1;
  let flow: Omit<SeasonFlow, "foreignShare"> = { season: state.season, toEurope: 0, fromAbroad: 0, domestic: 0, freeAgents: 0, preContracts: 0, loans: 0 };
  while (state.season <= lastSeason) {
    const before = state;
    const day = advanceDay(state, {});
    state = day.state;
    for (const event of day.events) {
      if (event.type !== "playerMoved") continue;
      if (event.kind === "abroad") flow.toEurope++;
      if (event.kind === "fromAbroad") flow.fromAbroad++;
      if (event.kind === "transfer") flow.domestic++;
      if (event.kind === "freeAgent") flow.freeAgents++;
      if (event.kind === "preContract") flow.preContracts++;
      if (event.kind === "loan") flow.loans++;
      if (event.fee > 0) top.push({ season: flow.season, name: event.name, kind: event.kind, from: event.fromClubId, to: event.toClubId, fee: event.fee });
    }
    if (!day.events.some((e) => e.type === "seasonEnded")) continue;
    flows.push({ ...flow, foreignShare: foreignShare(before) });
    flow = { season: state.season, toEurope: 0, fromAbroad: 0, domestic: 0, freeAgents: 0, preContracts: 0, loans: 0 };
  }
  return { flows, top: top.sort((a, b) => b.fee - a.fee).slice(0, 15) };
}
