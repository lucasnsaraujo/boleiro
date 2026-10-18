import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { matchEndOf, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import { liveLimits } from "./lineupDraft.js";

const isSameDials = (a: Tactics, b: Tactics) => a.formation === b.formation && a.posture === b.posture && (a.marking ?? "heavy") === (b.marking ?? "heavy") && a.play === b.play;

/**
 * The place in a coach's match plan of the saved tactics his key moves his side to: the one after the
 * tactics he plays now, or the first when he plays none of them; null when his plan keeps none.
 */
export function nextSavedTactics(side: Pick<CoachSide, "plan" | "tactics">): number | null {
  const saved = side.plan?.savedTactics ?? [];
  if (!saved.length) return null;
  const now = saved.findIndex((tactics) => isSameDials(tactics, side.tactics));
  return (now + 1) % saved.length;
}

/** What a key does in the live round for one of the human coaches: moves his side to its next saved tactics, or calls his time-out. */
export type PlanKeyPress<C> = { coached: C; command: "tactics" | "timeOut" };

/** The human coach whose match plan took `key`, and for which of his two commands; keys are one letter or digit, read case-blind. */
export function planKeyOf<C extends { side: Pick<CoachSide, "plan"> }>(coached: readonly C[], key: string): PlanKeyPress<C> | null {
  const pressed = key.toLowerCase();
  for (const one of coached) {
    if (one.side.plan?.timeOutKey === pressed) return { coached: one, command: "timeOut" };
    if (one.side.plan?.tacticsKey === pressed) return { coached: one, command: "tactics" };
  }
  return null;
}

/**
 * Whether the round stops to ask a human coach his shootout order at `minute`: his plan asks to be
 * asked, his match asks him (not under the house rule), and it ended level at this minute with a shootout to come.
 */
export function asksShootoutOrder(side: CoachSide, events: readonly MatchEvent[], clubId: string, minute: number): boolean {
  if (!side.plan?.asksBeforeShootout || side.incidentHandling !== "askCoach") return false;
  return minute === matchEndOf(events) && events.some((e) => e.type === "shootoutKick" && e.clubId === clubId);
}

/**
 * Who of a coach's side may kick his shootout, in the order they would: those who finished on the
 * pitch, his order first, then the rest strongest first.
 */
export function shootoutKickersOf(side: CoachSide, events: readonly MatchEvent[], clubId: string): string[] {
  const limits = liveLimits(side, events, clubId, matchEndOf(events));
  const finished = limits.onPitch.filter((id) => !limits.sentOff.has(id) && !limits.hurt.has(id));
  const strength = new Map(side.squad.map((p) => [p.id, p.strength]));
  const order = (side.tactics.kickerOrder ?? []).filter((id) => finished.includes(id));
  const rest = finished.filter((id) => !order.includes(id)).sort((a, b) => (strength.get(b) ?? 0) - (strength.get(a) ?? 0));
  return [...order, ...rest];
}
