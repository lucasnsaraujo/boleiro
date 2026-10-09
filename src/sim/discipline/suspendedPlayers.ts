import type { SimPlayer } from "../gameState.js";
import type { Discipline } from "./discipline.js";

/** Players who must sit out their club's next match in this competition. */
export function suspendedPlayers(discipline: Discipline, competitionId: string): ReadonlySet<string> {
  const records = discipline[competitionId] ?? {};
  return new Set(Object.keys(records).filter((id) => (records[id]?.bans ?? 0) > 0));
}

/** The coach can't field a suspended player, as he can't field an injured one. */
export function refuseSuspended(lineup: readonly SimPlayer[], suspended: ReadonlySet<string>): void {
  const banned = lineup.filter((player) => suspended.has(player.id));
  if (banned.length) throw new Error(`lineup has suspended players: ${banned.map((p) => p.name).join(", ")}`);
}
