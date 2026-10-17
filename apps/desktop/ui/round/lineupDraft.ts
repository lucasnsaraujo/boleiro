import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { LiveChange, Substitution } from "@boleiro/engine/sim/live/applyLiveChange";
import { EXTRA_TIME_SUBSTITUTIONS, EXTRA_TIME_WINDOWS, isFreeWindow, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS } from "@boleiro/engine/sim/live/aiSubstitutions";
import { FULL_TIME, matchEndOf, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { KickOff } from "@boleiro/game-client/engine/createEngineSession";
import type { CoachSide } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";

const LINEUP_SIZE = 11;

/** What the coach's match allows at the minute the sheet opens. */
export type LiveLimits = {
  minute: number;
  onPitch: string[];
  subsLeft: number;
  /** Stoppages the coach may still make substitutions in; half-time and extra time's breaks use none. */
  stopsLeft: number;
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

/** What the coach may still do at `minute`, by Law 3 as applyLiveChange enforces it: a sixth substitute and a fourth stoppage once extra time comes. */
export function liveLimits(coach: CoachSide, events: readonly MatchEvent[], clubId: string, minute: number): LiveLimits {
  const isExtraTime = minute >= FULL_TIME;
  const most = MAX_SUBSTITUTIONS + (isExtraTime ? EXTRA_TIME_SUBSTITUTIONS : 0);
  const mostWindows = MAX_SUBSTITUTION_WINDOWS + (isExtraTime ? EXTRA_TIME_WINDOWS : 0);
  const sofar = events.filter((e) => e.minute <= minute);
  const made = sofar.flatMap((e) => (e.type === "substitution" && e.clubId === clubId ? [e] : []));
  const windows = new Set(made.filter((e) => !isFreeWindow(e.minute)).map((e) => e.minute));
  const hasWindow = isFreeWindow(minute) || windows.has(minute) || windows.size < mostWindows;
  const onPitch = made.reduce((eleven, sub) => eleven.map((id) => (id === sub.offId ? sub.playerId : id)), coach.starters);
  const cameOn = new Set(made.map((e) => e.playerId));
  const ofCoach = (type: "injury" | "card") =>
    new Set(sofar.flatMap((e) => (e.type === type && e.clubId === clubId && (e.type !== "card" || e.card !== "yellow") ? [e.playerId] : [])));
  return {
    minute,
    onPitch,
    subsLeft: minute >= matchEndOf(events) || !hasWindow ? 0 : most - made.length,
    stopsLeft: mostWindows - windows.size,
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

/** Whether this player may come on for some starter: off the eleven, fit, and on the bench with substitutions left. */
export function canComeOn(sheet: Sheet, mode: SheetMode, player: SquadPlayer): boolean {
  if (sheet.lineup.includes(player.id)) return false;
  if (mode.kind === "preMatch") return player.status === null;
  return subsLeft(sheet, mode) > 0 && mode.benchIds.has(player.id);
}

/** Whether this player may come on for the picked starter. */
export function canBringOn(sheet: Sheet, mode: SheetMode, player: SquadPlayer): boolean {
  return sheet.picked !== null && canComeOn(sheet, mode, player);
}

/** Whether this player may come on for the starter `offId`, as dropping him on the starter's sticker asks. */
export function canSwapIn(sheet: Sheet, mode: SheetMode, offId: string, player: SquadPlayer): boolean {
  return canPick(sheet, mode, offId) && canBringOn({ ...sheet, picked: offId }, mode, player);
}

/** The starter `offId` makes way for this player in one go, whoever was picked before. */
export function swapIn(sheet: Sheet, mode: SheetMode, offId: string, player: SquadPlayer): Sheet {
  return canSwapIn(sheet, mode, offId, player) ? bringOn({ ...sheet, picked: offId }, mode, player) : sheet;
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

const OUT_REASONS: Record<NonNullable<SquadPlayer["status"]>, string> = {
  injured: "está machucado",
  suspended: "está suspenso",
  facesOwner: "não pode enfrentar o clube dono do passe",
};

/** What stops this eleven from kicking off, in the coach's words, or null when it can. */
export function lineupProblem(lineup: readonly string[], squad: readonly SquadPlayer[]): string | null {
  const players = squad.filter((p) => lineup.includes(p.id));
  if (players.length !== LINEUP_SIZE) return `Escale ${LINEUP_SIZE} jogadores.`;
  const keepers = players.filter((p) => p.group === "GK").length;
  if (keepers === 0) return "Escale um goleiro.";
  if (keepers > 1) return "Só um goleiro pode começar.";
  const out = players.find((p) => p.status !== null);
  if (out?.status) return `${out.name} ${OUT_REASONS[out.status]}.`;
  return null;
}

/**
 * The kick-off choice. An untouched sheet sends nothing, so the day plays as the sim would; any change
 * sends the eleven shown, since without it the sim picks a new eleven for a new formation.
 */
export function kickOffOf(sheet: Sheet, planned: readonly string[], tactics: Tactics): KickOff {
  const isSameEleven = sheet.lineup.length === planned.length && sheet.lineup.every((id) => planned.includes(id));
  const keys = new Set([...Object.keys(tactics), ...Object.keys(sheet.tactics)] as (keyof Tactics)[]);
  const isSameTactics = [...keys].every((key) => sheet.tactics[key] === tactics[key]);
  if (isSameEleven && isSameTactics) return {};
  return { lineup: sheet.lineup, ...(isSameTactics ? {} : { tactics: sheet.tactics }) };
}

/** The live change the sheet makes, or null when the coach changed nothing. */
export function liveChangeOf(sheet: Sheet, tactics: Tactics): LiveChange | null {
  const change: LiveChange = {
    ...(sheet.subs.length ? { substitutions: sheet.subs } : {}),
    ...(sheet.tactics.formation !== tactics.formation ? { formation: sheet.tactics.formation } : {}),
    ...(sheet.tactics.posture !== tactics.posture ? { posture: sheet.tactics.posture } : {}),
    ...(sheet.tactics.marking !== tactics.marking && sheet.tactics.marking ? { marking: sheet.tactics.marking } : {}),
    ...(sheet.tactics.play !== tactics.play && sheet.tactics.play ? { play: sheet.tactics.play } : {}),
    ...(sheet.tactics.penaltyTakerId !== tactics.penaltyTakerId ? { penaltyTakerId: sheet.tactics.penaltyTakerId } : {}),
  };
  return Object.keys(change).length ? change : null;
}
