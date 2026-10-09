import { advanceDay } from "../sim/advanceDay.js";
import type { Tier } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import type { MoveKind, PlayerMoved } from "../sim/transfers/transferEvents.js";
import { foreignShare } from "./foreignShare.js";

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

export type MoveCounts = Omit<SeasonFlow, "foreignShare">;

export const emptyFlow = (season: number): MoveCounts => ({ season, toEurope: 0, fromAbroad: 0, domestic: 0, freeAgents: 0, preContracts: 0, loans: 0 });

const COUNTED: Partial<Record<MoveKind, keyof Omit<MoveCounts, "season">>> = {
  abroad: "toEurope",
  fromAbroad: "fromAbroad",
  transfer: "domestic",
  freeAgent: "freeAgents",
  preContract: "preContracts",
  loan: "loans",
};

/** Adds one move to a season's counts by kind. */
export function tallyMove(flow: MoveCounts, move: PlayerMoved): MoveCounts {
  const key = COUNTED[move.kind];
  return key ? { ...flow, [key]: flow[key] + 1 } : flow;
}

/** Plays `seasons` whole seasons with no coach and counts each season's transfers by kind, plus the biggest fees. */
export function transferFlow(seed: number, seasons: number): { flows: SeasonFlow[]; top: TopTransfer[] } {
  let state = loadNewGame(seed, { coachClubId: null });
  const flows: SeasonFlow[] = [];
  const top: TopTransfer[] = [];
  const lastSeason = state.season + seasons - 1;
  let flow = emptyFlow(state.season);
  while (state.season <= lastSeason) {
    const before = state;
    const day = advanceDay(state, {});
    state = day.state;
    for (const event of day.events) {
      if (event.type !== "playerMoved") continue;
      flow = tallyMove(flow, event);
      if (event.fee > 0) top.push({ season: flow.season, name: event.name, kind: event.kind, from: event.fromClubId, to: event.toClubId, fee: event.fee });
    }
    if (!day.events.some((e) => e.type === "seasonEnded")) continue;
    flows.push({ ...flow, foreignShare: foreignShare(before) });
    flow = emptyFlow(state.season);
  }
  return { flows, top: top.sort((a, b) => b.fee - a.fee).slice(0, 15) };
}
