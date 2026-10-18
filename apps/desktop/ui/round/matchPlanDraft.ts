import { GROUP_OF_ROLE } from "@boleiro/data/players";
import { FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { MatchPlan } from "@boleiro/engine/sim/coach/matchPlan";
import { lineGivingWay } from "@boleiro/engine/sim/live/planSubstitutions";
import { commandForKey } from "../app/shortcuts.js";

/** Which of a coach's two plan keys: the one that cycles his saved tactics, or his time-out. */
export type PlanKey = "tacticsKey" | "timeOutKey";

const KEY_WORDS: Record<PlanKey, string> = { tacticsKey: "das táticas", timeOutKey: "do tempo técnico" };
const PLAN_KEY = /^[a-z0-9]$/;

/**
 * Why `key` can't be a coach's `which` key, or null when it can: only a letter or digit the game's own
 * shortcuts leave free (E plays the round, M mutes, T the table, 1–3 the speeds), not his other key and
 * not one another coach of the same keyboard took.
 */
export function planKeyProblem(key: string, which: PlanKey, plan: MatchPlan, keysTaken: readonly { key: string; coachName: string }[]): string | null {
  const pressed = key.toLowerCase();
  if (!PLAN_KEY.test(pressed)) return "Use uma letra ou um número.";
  if (commandForKey({ key: pressed, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, "other")) return `${pressed.toUpperCase()} já é um atalho do jogo.`;
  const other: PlanKey = which === "tacticsKey" ? "timeOutKey" : "tacticsKey";
  if (plan[other] === pressed) return `${pressed.toUpperCase()} já é a sua tecla ${KEY_WORDS[other]}.`;
  const taken = keysTaken.find((k) => k.key === pressed);
  return taken ? `${pressed.toUpperCase()} é a tecla de ${taken.coachName}.` : null;
}

/** A formation's players line by line, as its slots' positions put them. */
export function linesOf(formation: Formation): Record<PositionGroup, number> {
  const lines: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of FORMATIONS[formation]) lines[GROUP_OF_ROLE[slot.role]]++;
  return lines;
}

/** The shape as Brazilians say it: defence, midfield, attack. */
export const shapeName = (lines: Readonly<Record<PositionGroup, number>>): string => `${lines.DEF}-${lines.MID}-${lines.ATT}`;

/** What keeping the shape does to `formation` when a defender is sent off: the line that gives up a man, and the shape it plays on in. */
export function redCardExample(formation: Formation): { before: Record<PositionGroup, number>; after: Record<PositionGroup, number>; payer: PositionGroup | null } {
  const before = linesOf(formation);
  const left = { ...before, DEF: before.DEF - 1 };
  const payer = lineGivingWay(left, "DEF");
  const after = payer ? { ...before, [payer]: before[payer] - 1 } : left;
  return { before, after, payer };
}
