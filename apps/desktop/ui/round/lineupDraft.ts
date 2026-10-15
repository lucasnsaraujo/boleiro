import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { LiveChange, Substitution } from "@boleiro/engine/sim/live/applyLiveChange";
import { FULL_TIME, HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { KickOff } from "@boleiro/game-client/engine/createEngineSession";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";

// IFAB Laws of the Game 2025/26, Law 3.1, as applyLiveChange enforces them: five substitutes in at
// most three windows, half-time not counting as one.
const MAX_SUBSTITUTIONS = 5;
const MAX_WINDOWS = 3;
const LINEUP_SIZE = 11;

/** What the coach's match allows at the minute the sheet opens. */
export type LiveLimits = {
  minute: number;
  onPitch: string[];
  subsLeft: number;
  sentOff: ReadonlySet<string>;
  hurt: ReadonlySet<string>;
  /** Players who may still come on. */
  benchIds: ReadonlySet<string>;
  /** Players who came off; they can't come back. */
  cameOff: ReadonlySet<string>;
};

/** Before kick-off the coach picks any fit eleven; during the match he makes substitutions within the limits. */
export type SheetMode = { kind: "preMatch" } | ({ kind: "live" } & LiveLimits);

type Choice = { lineup: string[]; tactics: Tactics; subs: Substitution[] };
/** The lineup sheet being edited: the eleven, tactics and substitutions so far, the starter picked to go off, and what to undo. */
export type Sheet = Choice & { picked: string | null; history: Choice[] };

export function liveLimits(coach: CoachSide, events: readonly MatchEvent[], clubId: string, minute: number): LiveLimits {
  const sofar = events.filter((e) => e.minute <= minute);
  const made = sofar.flatMap((e) => (e.type === "substitution" && e.clubId === clubId ? [e] : []));
  const windows = new Set(made.filter((e) => e.minute !== HALF_TIME).map((e) => e.minute));
  const hasWindow = minute === HALF_TIME || windows.has(minute) || windows.size < MAX_WINDOWS;
  const onPitch = made.reduce((eleven, sub) => eleven.map((id) => (id === sub.offId ? sub.playerId : id)), coach.starters);
  const cameOn = new Set(made.map((e) => e.playerId));
  const ofCoach = (type: "injury" | "card") =>
    new Set(sofar.flatMap((e) => (e.type === type && e.clubId === clubId && (e.type !== "card" || e.card !== "yellow") ? [e.playerId] : [])));
  return {
    minute,
    onPitch,
    subsLeft: minute >= FULL_TIME || !hasWindow ? 0 : MAX_SUBSTITUTIONS - made.length,
    sentOff: ofCoach("card"),
    hurt: ofCoach("injury"),
    benchIds: new Set(coach.benchIds.filter((id) => !cameOn.has(id))),
    cameOff: new Set(made.map((e) => e.offId)),
  };
}

export function openSheet(lineup: readonly string[], tactics: Tactics): Sheet {
  return { lineup: [...lineup], tactics, subs: [], picked: null, history: [] };
}

function remember(sheet: Sheet): Choice[] {
  return [...sheet.history, { lineup: sheet.lineup, tactics: sheet.tactics, subs: sheet.subs }];
}

/** Substitutions the coach may still make in this sheet. */
export function subsLeft(sheet: Sheet, mode: SheetMode): number {
  return mode.kind === "live" ? Math.max(0, mode.subsLeft - sheet.subs.length) : Infinity;
}

/** Whether this starter may be picked to go off. */
export function canPick(sheet: Sheet, mode: SheetMode, id: string): boolean {
  if (mode.kind === "preMatch") return true;
  return subsLeft(sheet, mode) > 0 && !mode.sentOff.has(id) && !sheet.subs.some((s) => s.onId === id);
}

/** Whether this player may come on for the picked starter. */
export function canBringOn(sheet: Sheet, mode: SheetMode, player: SquadPlayer): boolean {
  if (!sheet.picked || sheet.lineup.includes(player.id)) return false;
  if (mode.kind === "preMatch") return player.status === null;
  return subsLeft(sheet, mode) > 0 && mode.benchIds.has(player.id);
}

export function pick(sheet: Sheet, mode: SheetMode, id: string): Sheet {
  if (!canPick(sheet, mode, id)) return sheet;
  return { ...sheet, picked: sheet.picked === id ? null : id };
}

export function bringOn(sheet: Sheet, mode: SheetMode, player: SquadPlayer): Sheet {
  const offId = sheet.picked;
  if (!offId || !canBringOn(sheet, mode, player)) return sheet;
  const lineup = sheet.lineup.map((id) => (id === offId ? player.id : id));
  const tactics = sheet.tactics.penaltyTakerId === offId ? { ...sheet.tactics, penaltyTakerId: null } : sheet.tactics;
  const subs = mode.kind === "live" ? [...sheet.subs, { offId, onId: player.id }] : sheet.subs;
  return { lineup, tactics, subs, picked: null, history: remember(sheet) };
}

/** Before kick-off, the assistant's eleven in place of the coach's (Escalar time); undo brings the coach's back. */
export function pickTeam(sheet: Sheet, lineup: readonly string[]): Sheet {
  return { ...sheet, lineup: [...lineup], picked: null, history: remember(sheet) };
}

export function changeTactics(sheet: Sheet, change: Partial<Tactics>): Sheet {
  return { ...sheet, tactics: { ...sheet.tactics, ...change }, history: remember(sheet) };
}

export function undo(sheet: Sheet): Sheet {
  const last = sheet.history.at(-1);
  return last ? { ...last, picked: null, history: sheet.history.slice(0, -1) } : sheet;
}

/** What stops this eleven from kicking off, in the coach's words, or null when it can. */
export function lineupProblem(lineup: readonly string[], squad: readonly SquadPlayer[]): string | null {
  const players = squad.filter((p) => lineup.includes(p.id));
  if (players.length !== LINEUP_SIZE) return `Escale ${LINEUP_SIZE} jogadores.`;
  const keepers = players.filter((p) => p.group === "GK").length;
  if (keepers === 0) return "Escale um goleiro.";
  if (keepers > 1) return "Só um goleiro pode começar.";
  const out = players.find((p) => p.status !== null);
  if (out) return `${out.name} está ${out.status === "injured" ? "machucado" : "suspenso"}.`;
  return null;
}

/**
 * The kick-off choice. An untouched sheet sends nothing, so the day plays as the sim would; any change
 * sends the eleven shown, since without it the sim picks a new eleven for a new formation.
 */
export function kickOffOf(sheet: Sheet, planned: readonly string[], tactics: Tactics): KickOff {
  const isSameEleven = sheet.lineup.length === planned.length && sheet.lineup.every((id) => planned.includes(id));
  const isSameTactics = (Object.keys(tactics) as (keyof Tactics)[]).every((key) => sheet.tactics[key] === tactics[key]);
  if (isSameEleven && isSameTactics) return {};
  return { lineup: sheet.lineup, ...(isSameTactics ? {} : { tactics: sheet.tactics }) };
}

/** The live change the sheet makes, or null when the coach changed nothing. */
export function liveChangeOf(sheet: Sheet, tactics: Tactics): LiveChange | null {
  const change: LiveChange = {
    ...(sheet.subs.length ? { substitutions: sheet.subs } : {}),
    ...(sheet.tactics.formation !== tactics.formation ? { formation: sheet.tactics.formation } : {}),
    ...(sheet.tactics.posture !== tactics.posture ? { posture: sheet.tactics.posture } : {}),
    ...(sheet.tactics.penaltyTakerId !== tactics.penaltyTakerId ? { penaltyTakerId: sheet.tactics.penaltyTakerId } : {}),
  };
  return Object.keys(change).length ? change : null;
}
