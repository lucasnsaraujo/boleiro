import type { Booking } from "@boleiro/engine/sim/discipline/drawCards";
import type { Substitution } from "@boleiro/engine/sim/live/applyLiveChange";
import { matchEndOf, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import type { LiveLimits } from "./lineupDraft.js";

/** A substitution the assistant suggests, and the player sent off or hurt it answers. */
export type Suggestion = Substitution & { forId: string };

/** What befell the coach's side at a minute that stopped the round: who was sent off or hurt, and the assistant's answer. */
export type Incident = {
  minute: number;
  sentOff: { playerId: string; card: Exclude<Booking["card"], "yellow"> }[];
  hurt: { playerId: string; days: number }[];
  /** How many of the coach's players are left on the pitch: those sent off and those hurt earlier and never replaced are not. */
  playersLeft: number;
  suggestions: Suggestion[];
};

const strongest = (players: readonly SquadPlayer[]) => [...players].sort((a, b) => b.strength - a.strength)[0];
const weakest = (players: readonly SquadPlayer[]) => [...players].sort((a, b) => a.strength - b.strength)[0];

/**
 * The red cards and injuries the coach's side took at the limits' minute, or null when none or when
 * his match has ended by then, with nothing left to change. The
 * assistant answers as the AI coaches do: a hurt player makes way for the strongest of his
 * position on the bench, and a keeper or defender sent off is replaced by one of his own for the
 * weakest forward; a midfielder or forward sent off leaves the side with ten. The man sent off
 * comes first when the substitutions left run short.
 */
export function incidentAt(coach: CoachSide, events: readonly MatchEvent[], clubId: string, limits: LiveLimits): Incident | null {
  if (limits.minute >= matchEndOf(events)) return null;
  const now = events.filter((e) => e.minute === limits.minute && "clubId" in e && e.clubId === clubId);
  const sentOff = now.flatMap((e) => (e.type === "card" && e.card !== "yellow" ? [{ playerId: e.playerId, card: e.card }] : []));
  const hurt = now.flatMap((e) => (e.type === "injury" ? [{ playerId: e.playerId, days: e.days }] : []));
  if (!sentOff.length && !hurt.length) return null;

  const byId = new Map(coach.squad.map((p) => [p.id, p]));
  const players = (ids: Iterable<string>) => [...ids].flatMap((id) => byId.get(id) ?? []);
  const onPitch = players(limits.onPitch.filter((id) => !limits.sentOff.has(id)));
  const bench = players(limits.benchIds);
  const suggestions: Suggestion[] = [];
  const isFree = (p: SquadPlayer) => !suggestions.some((s) => s.onId === p.id || s.offId === p.id);
  const suggest = (forId: string, off: SquadPlayer | undefined, on: SquadPlayer | undefined) => {
    if (off && on && suggestions.length < limits.subsLeft) suggestions.push({ forId, offId: off.id, onId: on.id });
  };

  for (const { playerId } of sentOff) {
    const group = byId.get(playerId)?.group;
    if (group !== "GK" && group !== "DEF") continue;
    const forwards = onPitch.filter((p) => p.group === "ATT" && !limits.hurt.has(p.id) && isFree(p));
    suggest(playerId, weakest(forwards), strongest(bench.filter((p) => p.group === group && isFree(p))));
  }
  for (const { playerId } of hurt) {
    const player = onPitch.find((p) => p.id === playerId);
    if (!player) continue;
    const free = bench.filter(isFree);
    suggest(playerId, player, strongest(free.filter((p) => p.group === player.group)) ?? strongest(free.filter((p) => p.group !== "GK")));
  }
  const isHurtBefore = (p: SquadPlayer) => limits.hurt.has(p.id) && !hurt.some((h) => h.playerId === p.id);
  return { minute: limits.minute, sentOff, hurt, playersLeft: onPitch.filter((p) => !isHurtBefore(p)).length, suggestions };
}

const DAYS_PER_WEEK = 7;

/** How long a player is out, as the window tells it: "4 dias", "2 semanas", "2 a 3 semanas". */
export function layoffText(days: number): string {
  if (days < 2 * DAYS_PER_WEEK) return days === 1 ? "1 dia" : `${days} dias`;
  const least = Math.floor(days / DAYS_PER_WEEK);
  const most = Math.ceil(days / DAYS_PER_WEEK);
  return least === most ? `${least} semanas` : `${least} a ${most} semanas`;
}
