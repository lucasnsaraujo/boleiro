import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import { EXTRA_HALF_TIME, FULL_TIME, HALF_TIME, matchEndOf } from "@boleiro/engine/sim/live/matchTimeline";
import { useCommands } from "../app/AppCommands.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { clubFaceOf } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import type { AdvanceResult } from "@boleiro/game-client/engine/createEngineSession";
import type { HotSeatView } from "@boleiro/game-client/hub/hotSeat";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { useFlip } from "../motion/useFlip.js";
import { hasOwnArrows } from "../round/hasOwnArrows.js";
import { HotSeatPitches, type Seat } from "../round/HotSeatPitches.js";
import { incidentAt, type Incident } from "../round/incident.js";
import { IncidentWindow } from "../round/IncidentWindow.js";
import { HalfTimeTalk, KickOffTalk } from "../round/TeamTalk.js";
import { LineupSheet } from "../round/LineupSheet.js";
import { MatchFile } from "../matchPage/MatchFile.js";
import { LivePitch } from "../round/LivePitch.js";
import type { TacticsContext } from "../round/TacticsPanel.js";
import { MatchReport } from "../round/MatchReport.js";
import { MiniScore } from "../round/MiniScore.js";
import { kickOffOf, liveChangeOf, liveLimits, type Sheet } from "../round/lineupDraft.js";
import type { LiveChange } from "@boleiro/engine/sim/live/applyLiveChange";
import type { TalkTone } from "@boleiro/engine/sim/live/teamTalk";
import type { VarCheck } from "@boleiro/engine/sim/referees/refereeCalls";
import { tacticsViewAt, type CoachSide, type HumanSide, type LiveRound, type RoundClub, type Side } from "@boleiro/game-client/round/liveRoundOf";
import { liveTable, shortTable, type LiveTableRow } from "../round/liveTable.js";
import type { MatchDayPlan } from "@boleiro/game-client/round/matchDayPlan";
import { calloutsBetween, goalsBetween, pauseReason, roundAt, roundEndOf, scorersUntil, varCheckAt, type Callout, type EventKind, type MatchAt } from "../round/roundAt.js";
import { VarSticker, type VarPhase } from "../round/VarSticker.js";
import { useStickerLift } from "../round/useStickerLift.js";
import type { Substitution } from "@boleiro/engine/sim/live/applyLiveChange";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import { crowdLevel, heardCues, roundCues, thinCues, varDecisionCues } from "../sound/roundCues.js";
import { useSound } from "../sound/SoundProvider.js";
import copaDoBrasil from "../../../../design/mocks/img/competitions/copa-do-brasil.svg";
import serieA from "../../../../design/mocks/img/competitions/serie-a.svg";
import serieB from "../../../../design/mocks/img/competitions/serie-b.svg";
import "./round.css";
import { DerbyBadgeOf } from "../rivalries/DerbyBadge.js";

type Speed = 0 | 1 | 2 | 4;
type Running = Exclude<Speed, 0>;
const SPEEDS: readonly Running[] = [1, 2, 4];
// guess: Brasfoot's normal speed plays a match in about a minute; 4x gets a round done in ten seconds.
const MS_PER_MINUTE: Record<Running, number> = { 1: 660, 2: 330, 4: 110 };
// A goal floods its row for less time when the clock runs faster, so goals a few minutes apart don't pile up.
const FLOOD_MS: Record<Running, number> = { 1: 1500, 2: 1150, 4: 800 };
// How long the scoring side's score box flashes; at 2x and 4x it outlasts the row's flood.
const BOX_FLASH_MS = 1300;
const COMPETITION_LOGOS = [
  { prefix: "Série A", src: serieA },
  { prefix: "Série B", src: serieB },
  { prefix: "Copa do Brasil", src: copaDoBrasil },
] as const;
// The slip of the table on the cover: the coach's club between its neighbours.
const TABLE_CARD_ROWS = 3;
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const NO_COLOURS = { primary: "#eef3e8", secondary: "#0a1a10" };
/** The crowd quietens while the clock stands still: half-time, a pause, a sheet open. */
const PAUSED_CROWD = 0.6;

type PreMatch = { plan: MatchDayPlan; clubs: Readonly<Record<string, Club>>; date: string };

/** A human coach's side as the round's windows need it: his club, his name in a hot-seat round, and his side of the match. */
type Coached = { clubId: string; coachName?: string; side: CoachSide };

/**
 * Every human coach's side today, in turn order as the hot-seat view lists the coaches; in a
 * one-coach game, just the coach's.
 */
function coachedSides(round: LiveRound, hotSeat: HotSeatView | null): Coached[] {
  if (!round.humanSides) return round.coach && round.coachClubId ? [{ clubId: round.coachClubId, side: round.coach }] : [];
  const order = hotSeat?.coaches.map((coach) => coach.clubId) ?? [];
  const place = (side: HumanSide) => (order.includes(side.clubId) ? order.indexOf(side.clubId) : order.length);
  return [...round.humanSides].sort((a, b) => place(a) - place(b)).map((side) => ({ clubId: side.clubId, coachName: side.coachName, side }));
}

/** Both sides' formations in a human coach's match: his as of his last change, and his rival's. */
function formationsOf(side: CoachSide): Record<Side, Formation> {
  return side.side === "home" ? { home: side.tactics.formation, away: side.rivalFormation } : { home: side.rivalFormation, away: side.tactics.formation };
}

/** An incident window waiting for a human coach: whose side, and what befell it. */
type OpenIncident = Coached & { incident: Incident };

/**
 * The first red card or injury the round stopped on at `minute` that a human coach has not answered
 * yet, in turn order: the session asks him about it, he changed nothing at this minute and he has
 * not left its window already.
 */
function incidentOf(round: LiveRound, minute: number, hotSeat: HotSeatView | null, answered: ReadonlySet<string> = new Set()): OpenIncident | null {
  const reason = pauseReason(round, minute);
  if (reason !== "coachMatch" && reason !== "halfTime" && reason !== "extraTimeBreak") return null;
  const sides = coachedSides(round, hotSeat);
  for (const coached of sides) {
    const { side, clubId } = coached;
    const match = round.matches.find((m) => m.fixtureId === side.fixtureId);
    // Two human coaches who meet share their match's last change, so it can't tell which of them answered.
    const isShared = sides.filter((other) => other.side.fixtureId === side.fixtureId).length > 1;
    if (side.incidentHandling !== "askCoach" || !match || (!isShared && side.lastChangeMinute === minute) || answered.has(clubId)) continue;
    const incident = incidentAt(side, match.events, clubId, liveLimits(side, match.events, clubId, minute));
    if (incident) return { ...coached, incident };
  }
  return null;
}
/** A goal being celebrated on a row: the scoring club's colour, its side, and the round's goal count so each goal replays the animation. */
type Flash = { colour: string; side: Side; count: number };
/**
 * A missed penalty, a red card, a human coach's substitution or the assistant's word on a player
 * having a bad day (`who`), called out on its row with a chip, counted like goals so each replays.
 */
type Alert = { kind: Callout["kind"] | "substitution"; count: number; who?: string };
const ALERT_CHIPS: Record<Alert["kind"], { label: string; className: string }> = {
  penaltyMiss: { label: "Pênalti", className: "pen" },
  red: { label: "Expulsão", className: "exp" },
  substitution: { label: "Troca", className: "sub" },
  badDay: { label: "Dia ruim", className: "bad" },
  var: { label: "VAR", className: "var" },
};
/**
 * A VAR check a human coach's match stands still for. guess: the board shows a check of 1 min 40 s
 * (Brazil's average) for 3.2 s at 1×, shorter at the faster speeds and for a shorter check, then holds
 * the decision for a beat before the sticker peels off and the clock runs again.
 */
type VarHold = { fixtureId: string; check: VarCheck; phase: VarPhase };
const VAR_CHECK_MS: Record<Running, number> = { 1: 3200, 2: 2400, 4: 1600 };
const VAR_DECIDED_MS: Record<Running, number> = { 1: 1700, 2: 1400, 4: 1100 };
const VAR_PEEL_MS = 380;
const AVERAGE_CHECK_SECONDS = 100;
// How long a hot-seat coach's half-time card shows the group's reaction before the next coach's comes up.
const TALK_REACTION_MS = 2400;
// How the band notes a goal that did not come from open play.
const GOAL_NOTES: Partial<Record<GoalKind, string>> = { penalty: "pên.", freeKick: "falta", olympic: "olímpico", ownGoal: "contra" };

export function Round() {
  const { engine } = useServices();
  const { engine: sound } = useSound();
  const navigate = useNavigate();
  const [preMatch, setPreMatch] = useState<PreMatch | null>(null);
  // The coach's talk before kick-off, if he picked one in the lineup sheet.
  const [kickOffTalk, setKickOffTalk] = useState<TalkTone | null>(null);
  // The club whose half-time talk was just given: its card shows how the group took it for a moment.
  const [talkedClubId, setTalkedClubId] = useState<string | null>(null);
  const [round, setRound] = useState<LiveRound | null>(null);
  const [failure, setFailure] = useState<"noMatch" | "unreachable" | null>(null);
  const [hotSeat, setHotSeat] = useState<HotSeatView | null>(null);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0);
  const resumeSpeed = useRef<Running>(1);
  const wasRunning = useRef(false);
  // The club whose lineup is open over the round: the coach's, or in a hot-seat round any human coach's.
  const [lineupClubId, setLineupClubId] = useState<string | null>(null);
  // In a hot-seat round, the human coach whose board is in focus: Space opens his match and the arrows move on from him.
  const [focusClubId, setFocusClubId] = useState<string | null>(null);
  const isLineupOpen = lineupClubId !== null;
  const [isTableOpen, setTableOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdvanceResult | null>(null);
  const [isOnlyMine, setOnlyMine] = useState(false);
  const [isOtherLeaguesOpen, setOtherLeaguesOpen] = useState(false);
  // The match whose ficha is open over the board; the clock keeps running under it.
  const [fileRef, setFileRef] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, Flash>>({});
  const [alerts, setAlerts] = useState<Record<string, Alert>>({});
  const [incident, setIncident] = useState<OpenIncident | null>(null);
  const [varHold, setVarHold] = useState<VarHold | null>(null);
  const varTimers = useRef<number[]>([]);
  // The clubs whose incident window was left at the minute the round stands on, so the next coach's opens.
  const answered = useRef<{ minute: number; clubIds: Set<string> }>({ minute: -1, clubIds: new Set() });
  // Matches a human coach made substitutions in while a window covered the board; their rows call it out once it closes.
  const substituted = useRef(new Set<string>());
  // A step to the next coach's match is on its way; key repeats faster than a render wait for it.
  const isStepping = useRef(false);
  const [golCount, setGolCount] = useState(0);
  const goalsCelebrated = useRef(0);
  const roundRef = useRef(round);
  const shownMinute = useRef(0);
  const isFinishing = useRef(false);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    let isCurrent = true;
    async function open() {
      const [live, seats] = await Promise.all([engine.liveRound(), engine.hotSeat()]);
      if (!isCurrent) return;
      setHotSeat(seats);
      if (live) {
        const at = Math.max(live.seenMinute, live.coach?.lastChangeMinute ?? 0);
        if (!isCurrent) return;
        shownMinute.current = at;
        roundRef.current = live;
        setRound(live);
        setMinute(at);
        setIncident(incidentOf(live, at, seats));
        // Back after a final whistle that didn't go through: no new minute will call it again.
        if (at >= roundEndOf(live)) void finish();
        return;
      }
      // In a hot-seat game the last coach may have no match today while the others do: their round starts at once.
      if (seats?.isLastTurn && !seats.coaches[seats.seated]?.playsToday) {
        const started = await engine.apply({ type: "startRound" });
        if (!isCurrent) return;
        roundRef.current = started;
        setRound(started);
        setSpeed(resumeSpeed.current);
        return;
      }
      const [plan, { clubs, date }] = await Promise.all([engine.matchDayPlan(), engine.read(["clubs", "date"])]);
      if (isCurrent) setPreMatch({ plan, clubs, date });
    }
    open().catch((error: unknown) => {
      const hasNoMatch = error instanceof Error && error.message.includes("no match today");
      if (isCurrent) setFailure(hasNoMatch ? "noMatch" : "unreachable");
    });
    return () => {
      isCurrent = false;
    };
  }, [engine]);

  // The round runs to 120 when one of its matches goes to extra time.
  const end = round ? roundEndOf(round) : FULL_TIME;
  const isRunning = round !== null && speed > 0 && !isLineupOpen && !isTableOpen && incident === null && varHold === null && minute < end;
  useEffect(() => () => varTimers.current.forEach((timer) => clearTimeout(timer)), []);
  useEffect(() => {
    if (!isRunning || speed === 0) return;
    const tick = setInterval(() => setMinute((m) => Math.min(end, m + 1)), MS_PER_MINUTE[speed]);
    return () => clearInterval(tick);
  }, [isRunning, speed, end]);

  function pause() {
    setSpeed((current) => {
      if (current !== 0) resumeSpeed.current = current;
      return 0;
    });
  }

  async function finish() {
    if (isFinishing.current) return;
    isFinishing.current = true;
    setError(null);
    try {
      setResult(await engine.apply({ type: "finishRound" }));
    } catch {
      isFinishing.current = false;
      setError("Não deu para encerrar a rodada.");
    }
  }

  // Each new minute celebrates its goals, then stops the round when the minute calls for it. The
  // minute alone drives this: the new round a live change brings must not replay its minute.
  useEffect(() => {
    const live = roundRef.current;
    const from = shownMinute.current;
    if (!live || minute <= from) return;
    shownMinute.current = minute;
    engine.apply({ type: "seeMinute", minute }).catch(() => undefined);
    // A VAR check holds back what it rules on: its match's goal or red card, seen and heard, waits for the decision.
    const held = varCheckAt(live, minute);
    const side = live.coach?.side ?? null;
    for (const cue of heardCues(thinCues(roundCues(live, from, minute, held?.fixtureId ?? null), resumeSpeed.current), side)) sound.play(cue);
    const isHeldBack = (fixtureId: string) => held?.fixtureId === fixtureId;
    const goals = goalsBetween(live, from, minute);
    celebrate(live, goals.filter((goal) => !isHeldBack(goal.fixtureId)));
    const called = Object.fromEntries(
      calloutsBetween(live, from, minute).map(({ fixtureId, kind, who }) => [fixtureId, { kind, count: ++goalsCelebrated.current, ...(who ? { who } : {}) }] as const),
    );
    if (Object.keys(called).length) {
      setAlerts((current) => ({ ...current, ...called }));
      setTimeout(() => setAlerts((current) => Object.fromEntries(Object.entries(current).filter(([fixtureId, alert]) => called[fixtureId] !== alert))), FLOOD_MS[resumeSpeed.current]);
    }
    const reason = pauseReason(live, minute);
    const incidentNow = incidentOf(live, minute, hotSeat);
    // The round stops with the window it stops for, after a VAR check's decision: a speed picked in between would leave the window over a clock that looks running.
    const stopNow = () => {
      if (reason === "halfTime" || reason === "extraTimeBreak" || reason === "coachMatch") pause();
      setIncident(incidentNow);
    };
    const finishNow = () => {
      if (reason === "fullTime") void finish();
    };
    if (!held) {
      stopNow();
      finishNow();
      return;
    }
    sound.play("varCheck");
    holdForVar(held, () => {
      for (const cue of heardCues(varDecisionCues(live, held), side)) sound.play(cue);
      celebrate(live, goals.filter((goal) => isHeldBack(goal.fixtureId)));
      stopNow();
    }, finishNow);
  }, [minute]);

  /** Rolls each scoring row's digit and sweeps it in the scorer's colour; the coach's own goal sweeps GOL across the cover. */
  function celebrate(live: LiveRound, goals: ReturnType<typeof goalsBetween>) {
    if (goals.length) {
      const celebrated = Object.fromEntries(
        goals.map((goal) => {
          const colour = live.clubs[goal.clubId]?.colours.primary ?? NO_COLOURS.primary;
          return [goal.fixtureId, { colour, side: goal.side, count: ++goalsCelebrated.current }];
        }),
      );
      setFlashes((current) => ({ ...current, ...celebrated }));
      // Once played, a flash leaves its row: a row Só meus jogos hid and shows again would otherwise replay it.
      setTimeout(
        () => setFlashes((current) => Object.fromEntries(Object.entries(current).filter(([fixtureId, flash]) => celebrated[fixtureId] !== flash))),
        Math.max(FLOOD_MS[resumeSpeed.current], BOX_FLASH_MS),
      );
      if (goals.some((goal) => goal.fixtureId === live.coach?.fixtureId && goal.clubId === live.coachClubId)) setGolCount((n) => n + 1);
    }
  }

  /**
   * Stands the round still while VAR checks a human coach's match: the check, then its decision
   * (`onDecided`), then play again (`onDone`; a check at the final whistle ends the round only then).
   */
  function holdForVar(held: Omit<VarHold, "phase">, onDecided: () => void, onDone: () => void) {
    varTimers.current.forEach((timer) => clearTimeout(timer));
    const pace = resumeSpeed.current;
    const checking = VAR_CHECK_MS[pace] * Math.min(1.2, Math.max(0.6, held.check.seconds / AVERAGE_CHECK_SECONDS));
    const decided = checking + VAR_DECIDED_MS[pace];
    setVarHold({ ...held, phase: "checking" });
    varTimers.current = [
      window.setTimeout(() => {
        setVarHold((current) => current && { ...current, phase: "decided" });
        onDecided();
      }, checking),
      window.setTimeout(() => setVarHold((current) => current && { ...current, phase: "leaving" }), decided),
      window.setTimeout(() => {
        setVarHold(null);
        onDone();
      }, decided + VAR_PEEL_MS),
    ];
  }

  async function kickOff(sheet: Sheet) {
    if (!preMatch) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = { ...kickOffOf(sheet, preMatch.plan.lineup, preMatch.plan.tactics), ...(kickOffTalk ? { talk: kickOffTalk } : {}) };
      if (hotSeat && !hotSeat.isLastTurn) {
        await engine.apply({ type: "passTurn", ...chosen });
        navigate("/turn");
        return;
      }
      const live = await engine.apply({ type: "startRound", ...chosen });
      shownMinute.current = 0;
      roundRef.current = live;
      setRound(live);
      setPreMatch(null);
      setMinute(0);
      setSpeed(resumeSpeed.current);
    } catch {
      setError("Não deu para começar a rodada. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  /** Opening a sheet stops the clock; closing it starts the clock again only if it was running. */
  function openSheet(open: (isOpen: boolean) => void) {
    wasRunning.current = speed !== 0;
    pause();
    setError(null);
    open(true);
  }

  function openLineup(clubId: string) {
    setFocusClubId(clubId);
    openSheet((isOpen) => setLineupClubId(isOpen ? clubId : null));
  }

  /** The incident windows left at this minute, so each coach's opens once. */
  function answeredAt(at: number): Set<string> {
    if (answered.current.minute !== at) answered.current = { minute: at, clubIds: new Set() };
    return answered.current.clubIds;
  }

  /** The rows of the matches changed under a window call their substitutions out, now the board shows again. */
  function callOutSubstitutions() {
    const called = Object.fromEntries([...substituted.current].map((fixtureId) => [fixtureId, { kind: "substitution" as const, count: ++goalsCelebrated.current }]));
    substituted.current.clear();
    if (!Object.keys(called).length) return;
    setAlerts((current) => ({ ...current, ...called }));
    setTimeout(() => setAlerts((current) => Object.fromEntries(Object.entries(current).filter(([fixtureId, alert]) => called[fixtureId] !== alert))), FLOOD_MS[resumeSpeed.current]);
  }

  /** Sends a human coach's change at the minute on the clock; the seated coach's goes without naming his club. */
  async function changeLive(clubId: string, change: LiveChange): Promise<LiveRound> {
    const changed = await engine.apply({ type: "changeLive", minute, change, ...(clubId === round?.coachClubId ? {} : { clubId }) });
    roundRef.current = changed;
    setRound(changed);
    const fixtureId = sideOf(changed, clubId)?.fixtureId;
    if (change.substitutions?.length && fixtureId) substituted.current.add(fixtureId);
    return changed;
  }

  /** A human coach's half-time talk; his card then shows how the group took it, and in a hot-seat round makes way for the next coach's. */
  async function talkAtHalfTime(clubId: string, talk: TalkTone) {
    setBusy(true);
    setError(null);
    try {
      const changed = await changeLive(clubId, { talk });
      setTalkedClubId(clubId);
      const isNextWaiting = coachedSides(changed, hotSeat).some((other) => other.clubId !== clubId && !other.side.halfTimeTalk.given);
      if (isNextWaiting) window.setTimeout(() => setTalkedClubId((current) => (current === clubId ? null : current)), TALK_REACTION_MS);
    } catch {
      setError("A conversa não aconteceu. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  /** Sends what the coach changed in his lineup sheet, if anything; false when the session refused it. */
  async function sendSheet(clubId: string, sheet: Sheet): Promise<LiveRound | false> {
    const current = roundRef.current;
    const tactics = current && sideOf(current, clubId)?.tactics;
    const change = tactics ? liveChangeOf(sheet, tactics) : null;
    if (!change || !current) return current ?? false;
    setBusy(true);
    try {
      return await changeLive(clubId, change);
    } catch {
      setError("A troca não valeu. Tente de novo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** In a hot-seat round, ← and → take the coach's changes and open the next human coach's match, in turn order. */
  async function stepCoach(sheet: Sheet, step: 1 | -1) {
    const clubId = lineupClubId;
    if (!clubId || isStepping.current) return;
    isStepping.current = true;
    const sent = await sendSheet(clubId, sheet).finally(() => {
      isStepping.current = false;
    });
    if (!sent) return;
    const order = coachedSides(sent, hotSeat);
    const place = order.findIndex((coached) => coached.clubId === clubId);
    const next = order[(place + step + order.length) % order.length];
    setError(null);
    if (!next) return;
    setLineupClubId(next.clubId);
    setFocusClubId(next.clubId);
  }

  function resumeIfRunning() {
    if (wasRunning.current) setSpeed(resumeSpeed.current);
  }

  function closeTable() {
    setTableOpen(false);
    resumeIfRunning();
  }

  async function backToMatch(sheet: Sheet) {
    if (!lineupClubId) return;
    const sent = await sendSheet(lineupClubId, sheet);
    if (!sent) return;
    setLineupClubId(null);
    callOutSubstitutions();
    // Another human coach's side may still have an incident to answer at this minute.
    const next = incidentOf(sent, minute, hotSeat, answeredAt(minute));
    if (next) setIncident(next);
    else resumeIfRunning();
  }

  /** The incident window closes into the next coach's waiting at this minute, or into the match as it was running before the stop. */
  function leaveIncident(after: LiveRound | null = roundRef.current) {
    if (incident) answeredAt(minute).add(incident.clubId);
    const next = after && incidentOf(after, minute, hotSeat, answeredAt(minute));
    setIncident(next);
    if (next) return;
    callOutSubstitutions();
    setSpeed(resumeSpeed.current);
  }

  function openLineupFromIncident() {
    if (!incident) return;
    answeredAt(minute).add(incident.clubId);
    setIncident(null);
    wasRunning.current = true;
    setError(null);
    setLineupClubId(incident.clubId);
  }

  async function substituteFromIncident(substitutions: Substitution[]) {
    if (!incident) return;
    setBusy(true);
    setError(null);
    try {
      leaveIncident(await changeLive(incident.clubId, { substitutions }));
    } catch {
      setError("A troca não valeu. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function chooseSpeed(next: Speed) {
    if (next !== 0) resumeSpeed.current = next;
    setSpeed(next);
  }

  // The match keys work only while the match can still be driven: kicked off, before the final whistle, no sheet open.
  const isDrivable = round !== null && result === null && minute < end && !isLineupOpen && !isTableOpen && incident === null;
  // In a hot-seat round every human coach has a board, in turn order; the arrows move the focus through them.
  const boardCoaches = round?.humanSides ? coachedSides(round, hotSeat) : [];
  const focus = Math.max(0, boardCoaches.findIndex((coached) => coached.clubId === focusClubId));
  const focused = boardCoaches[focus];
  // Space is the coaches' time-out: it stops the clock on the match of the coach in focus, the first one until the arrows move, and going back to the game runs it again.
  useCommands({
    pausar:
      isDrivable &&
      (() => {
        if (!focused) return chooseSpeed(speed === 0 ? resumeSpeed.current : 0);
        openLineup(focused.clubId);
        wasRunning.current = true;
      }),
    velocidade1: isDrivable && (() => chooseSpeed(1)),
    velocidade2: isDrivable && (() => chooseSpeed(2)),
    velocidade3: isDrivable && (() => chooseSpeed(4)),
    tabelaAoVivo: isDrivable && round.table !== null && (() => openSheet(setTableOpen)),
  });

  const crowd = round && result === null && minute < end ? crowdLevel(round, minute) * (isRunning ? 1 : PAUSED_CROWD) : null;
  useEffect(() => sound.setCrowd(crowd), [sound, crowd]);
  useEffect(() => () => sound.setCrowd(null), [sound]);

  // On the board ← and → step the focus; inside a window the arrows are the window's own.
  const canStepBoards = boardCoaches.length > 1 && !isLineupOpen && !isTableOpen && incident === null;
  useEffect(() => {
    if (!canStepBoards) return;
    const onKey = (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || hasOwnArrows(event.target)) return;
      event.preventDefault();
      setFocusClubId(boardCoaches[(focus + step + boardCoaches.length) % boardCoaches.length]?.clubId ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!isTableOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeTable();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (failure) {
    return (
      <div className="live-missing">
        <h1 className="screen-title">{failure === "noMatch" ? "Nenhum jogo hoje" : "Rodada"}</h1>
        {failure === "unreachable" && <p className="status error">Não deu para abrir a rodada.</p>}
        <p className="status">
          <Link to="/hub" className="btn y">
            Voltar ao clube
          </Link>
        </p>
      </div>
    );
  }

  if (preMatch) {
    const { plan, clubs } = preMatch;
    const vs = `${clubFaceOf(clubs, plan.homeId)?.shortName ?? ""} x ${clubFaceOf(clubs, plan.awayId)?.shortName ?? ""}`;
    const opponent = clubFaceOf(clubs, plan.homeId === plan.clubId ? plan.awayId : plan.homeId);
    const own = clubFaceOf(clubs, plan.clubId);
    return (
      <LineupSheet
        sub={`${vs} · ${plan.label}`}
        squad={plan.squad}
        lineup={plan.lineup}
        tactics={plan.tactics}
        mode={{ kind: "preMatch" }}
        doneLabel={hotSeat && !hotSeat.isLastTurn ? "Confirmar e passar a vez" : "Começar a rodada"}
        isBusy={isBusy}
        error={error}
        onDone={(sheet) => void kickOff(sheet)}
        onLeave={() => navigate("/hub")}
        assistantLineup={plan.assistantLineup}
        onPickTeam={async (formation) => (await engine.matchDayPlan(formation)).assistantLineup}
        talk={<KickOffTalk moment={plan.talk.moment} suggested={plan.talk.suggested} picked={kickOffTalk} onPick={setKickOffTalk} />}
        chemistry={{
          value: plan.chemistry.value,
          captainId: plan.chemistry.captainId,
          suggestedId: plan.chemistry.suggestedCaptainId,
          onName: async (playerId) => {
            await engine.apply({ type: "nameCaptain", playerId });
            return (await engine.chemistry())?.value ?? plan.chemistry.value;
          },
        }}
        {...(opponent ? { opponent: { club: opponent, formation: plan.opponentFormation } } : {})}
        {...(own && opponent ? { tacticsContext: { club: own, opponentClub: opponent, opponent: plan.opponent, opponentForm: plan.opponentForm, moment: plan.moment } } : {})}
      />
    );
  }

  if (!round) return <p className="status live-missing">Abrindo a rodada…</p>;

  const matches = roundAt(round, minute, varHold?.phase === "checking" ? varHold.fixtureId : null);
  const mine = matches.find((m) => m.isCoach);
  const scores = new Map(matches.map((m) => [m.fixtureId, m.score]));
  const table = round.table && liveTable(round.table, scores);
  const coach = round.coach;
  const limitsOf = (side: CoachSide | null, clubId: string | null) => {
    const match = round.matches.find((m) => m.fixtureId === side?.fixtureId);
    return side && match && clubId ? liveLimits(side, match.events, clubId, minute) : null;
  };
  const limits = limitsOf(coach, round.coachClubId);
  const coached = coachedSides(round, hotSeat);
  // The dressing room at the break: the coach's card, or in a hot-seat round each coach's in turn.
  const isAtBreak = minute === HALF_TIME && speed === 0 && result === null && !isLineupOpen && !isTableOpen && incident === null && varHold === null && fileRef === null;
  const talker = isAtBreak ? (coached.find((c) => c.clubId === talkedClubId) ?? coached.find((c) => !c.side.halfTimeTalk.given)) : undefined;
  const talkMatch = talker && matches.find((m) => m.fixtureId === talker.side.fixtureId);
  const lineupSide = coached.find((c) => c.clubId === lineupClubId);
  const lineupLimits = lineupSide ? limitsOf(lineupSide.side, lineupSide.clubId) : null;
  const incidentLimits = incident ? limitsOf(incident.side, incident.clubId) : null;
  const incidentMatch = incident && matches.find((m) => m.fixtureId === incident.side.fixtureId);
  // On a human coach's own match the ficha offers his substitutions through his lineup sheet.
  const fileCoach = result === null ? coached.find((c) => c.side.fixtureId === fileRef) : undefined;
  const substituteFromFile = (clubId: string) => {
    setFileRef(null);
    openLineup(clubId);
  };
  const seats: Seat[] = boardCoaches.flatMap(({ clubId, coachName, side }) => {
    const match = matches.find((m) => m.fixtureId === side.fixtureId);
    return match ? [{ clubId, coach: coachName ?? "", match, formations: formationsOf(side) }] : [];
  });
  const isFinished = result !== null;
  // After a hot-seat round the first coach in turn order takes the seat again, behind the hand-off screen.
  const afterRound = hotSeat ? "/turn" : "/hub";
  // Rows Só meus jogos leaves out are hidden, not dropped, so they keep their state while out of sight.
  const groups = round.competitions
    .map((competition) => ({ ...competition, rows: matches.filter((m) => m.competitionId === competition.id) }))
    .filter((group) => group.rows.length > 0);
  // Competitions without a human coach fold under "Outras ligas"; with no human coach anywhere, nothing folds.
  const isFolding = groups.some((group) => group.hasHumanCoach);
  const openGroups = isFolding ? groups.filter((group) => group.hasHumanCoach) : groups;
  const otherGroups = isFolding ? groups.filter((group) => !group.hasHumanCoach) : [];
  const otherMatchCount = otherGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const groupSection = (group: (typeof groups)[number], isHidden: boolean) => (
    <section key={group.id} className="live-group" aria-labelledby={`live-${group.id}`} hidden={isHidden}>
      <h2 id={`live-${group.id}`} className="live-g">
        <CompetitionLogo label={group.label} size={20} />
        {group.label}
      </h2>
      <ul className="live-rows" aria-labelledby={`live-${group.id}`}>
        {group.rows.map((m) => (
          <MatchRow key={m.fixtureId} match={m} clubs={round.clubs} flash={flashes[m.fixtureId]} alert={alerts[m.fixtureId]} isHidden={isOnlyMine && !m.isHuman} onOpen={setFileRef} />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="live fills-screen" style={{ ["--flood" as string]: `${FLOOD_MS[resumeSpeed.current]}ms`, ["--box-flash" as string]: `${BOX_FLASH_MS}ms` }}>
      {mine && coach ? (
        <Cover
          round={round}
          match={mine}
          formations={formationsOf(coach)}
          seats={seats}
          focus={focus}
          onFocus={(index) => setFocusClubId(seats[index]?.clubId ?? null)}
          isRunning={isRunning}
          msPerMinute={MS_PER_MINUTE[resumeSpeed.current]}
          label={round.competitions.find((c) => c.id === mine.competitionId)?.label ?? ""}
          minute={minute}
          end={end}
          speed={speed}
          golCount={golCount}
          varHold={varHold}
          onSpeed={chooseSpeed}
          isOnlyMine={isOnlyMine}
          onOnlyMine={setOnlyMine}
          isFinished={isFinished}
          shootoutWinner={shootoutWinnerOf(result, mine.fixtureId, round.clubs)}
          table={table && <TableCard rows={table} clubs={round.clubs} coachClubId={round.coachClubId} onOpen={() => openSheet(setTableOpen)} />}
        >
          {isFinished ? (
            <button className="btn y live-act" onClick={() => navigate(afterRound)}>
              <i className="ph-bold ph-arrow-left" aria-hidden="true" />
              {hotSeat ? "Próxima vez" : "Voltar ao clube"}
            </button>
          ) : minute >= end ? (
            error ? (
              <button className="btn y live-act" onClick={() => void finish()}>
                Tentar de novo
              </button>
            ) : (
              <button className="btn y live-act" disabled>
                Encerrando…
              </button>
            )
          ) : (
            <button className="btn y live-act" onClick={() => round.coachClubId && openLineup(round.coachClubId)}>
              <i className="ph-bold ph-strategy" aria-hidden="true" />
              Escalação <small>{limits?.subsLeft === 1 ? "1 troca" : `${limits?.subsLeft ?? 0} trocas`}</small>
            </button>
          )}
        </Cover>
      ) : (
        <header className="live-plain" data-tauri-drag-region>
          <h1>Rodada</h1>
          <span>{formatBarDate(round.date)}</span>
          {isFinished && (
            <button className="btn y live-act" onClick={() => navigate(afterRound)}>
              <i className="ph-bold ph-arrow-left" aria-hidden="true" />
              {hotSeat ? "Próxima vez" : "Voltar ao clube"}
            </button>
          )}
        </header>
      )}
      {error && !isLineupOpen && !incident && <p className="status error live-error">{error}</p>}

      <div className="live-list">
        {minute >= end && <MatchReport round={round} />}
        {openGroups.map((group) => groupSection(group, isOnlyMine && !group.rows.some((m) => m.isHuman)))}
        {otherGroups.length > 0 && (
          <div className="live-others" hidden={isOnlyMine}>
            <button type="button" className="live-g live-others-toggle" aria-expanded={isOtherLeaguesOpen} aria-controls="live-other-leagues" onClick={() => setOtherLeaguesOpen(!isOtherLeaguesOpen)}>
              <i className="ph-bold ph-caret-right" aria-hidden="true" />
              Outras ligas
              <small>{otherMatchCount === 1 ? "1 jogo" : `${otherMatchCount} jogos`}</small>
            </button>
            <div id="live-other-leagues">{otherGroups.map((group) => groupSection(group, !isOtherLeaguesOpen))}</div>
          </div>
        )}
      </div>

      {isTableOpen && table && (
        <TableSheet onClose={closeTable} note={isFinished ? "com os resultados da rodada" : "se terminasse agora"}>
          <TableRows rows={table} clubs={round.clubs} coachClubId={round.coachClubId} isFull />
        </TableSheet>
      )}

      {incident && incidentLimits && incidentMatch && (
        <IncidentWindow
          key={incident.clubId}
          incident={incident.incident}
          round={round}
          match={incidentMatch}
          side={incident.side}
          clubId={incident.clubId}
          {...(incident.coachName ? { coachName: incident.coachName } : {})}
          subsLeft={incidentLimits.subsLeft}
          stopsLeft={incidentLimits.stopsLeft}
          isBusy={isBusy}
          error={error}
          onLeave={() => leaveIncident()}
          onOpenLineup={openLineupFromIncident}
          onSubstitute={(substitutions) => void substituteFromIncident(substitutions)}
        />
      )}

      {talker && talkMatch && (
        <HalfTimeTalk
          key={talker.clubId}
          club={round.clubs[talker.clubId]?.shortName ?? ""}
          clubId={talker.clubId}
          home={round.clubs[talkMatch.homeId]?.shortName ?? ""}
          away={round.clubs[talkMatch.awayId]?.shortName ?? ""}
          score={`${talkMatch.score.home} × ${talkMatch.score.away}`}
          {...(talker.coachName && coached.length > 1 ? { coachName: talker.coachName } : {})}
          moment={talker.side.halfTimeTalk.moment}
          suggested={talker.side.halfTimeTalk.suggested}
          given={talker.side.halfTimeTalk.given}
          isBusy={isBusy}
          onTalk={(talk) => void talkAtHalfTime(talker.clubId, talk)}
        />
      )}

      {/* The coach's own windows take over from the ficha; it comes back as it was once they shut. */}
      <MatchFile matchRef={incident || lineupSide ? null : fileRef} minute={minute} version={round} onClose={() => setFileRef(null)} {...(fileCoach ? { onSubstitute: () => substituteFromFile(fileCoach.clubId) } : {})} />

      {lineupSide && lineupLimits && (
        <LineupSheet
          key={lineupSide.clubId}
          sub={round.clubs[lineupSide.clubId]?.shortName ?? ""}
          squad={lineupSide.side.squad}
          lineup={lineupLimits.onPitch}
          tactics={lineupSide.side.tactics}
          mode={{ kind: "live", ...lineupLimits }}
          doneLabel="Voltar ao jogo"
          isBusy={isBusy}
          error={error}
          onDone={(sheet) => void backToMatch(sheet)}
          {...tacticsContextOf(round, lineupSide.clubId, lineupSide.side, minute)}
          {...(lineupSide.coachName && coached.length > 1
            ? { coachStep: { name: lineupSide.coachName, place: coached.indexOf(lineupSide) + 1, count: coached.length, onStep: (sheet: Sheet, step: 1 | -1) => void stepCoach(sheet, step) } }
            : {})}
        />
      )}
    </div>
  );
}

/** The tactics panel's view of a human coach's live match at the minute shown: both clubs, the opponent on the pitch and the score. */
function tacticsContextOf(round: LiveRound, clubId: string, side: CoachSide, minute: number): { tacticsContext?: TacticsContext } {
  const club = round.clubs[clubId];
  const opponentClub = round.clubs[side.opponent.clubId];
  return club && opponentClub ? { tacticsContext: { club, opponentClub, opponentForm: side.opponent.form, ...tacticsViewAt(round, side, minute) } } : {};
}

/** A human coach's side in the round, by his club: the seated coach's, or a hot-seat coach's waiting for his turn. */
function sideOf(round: LiveRound, clubId: string): CoachSide | null {
  return round.humanSides?.find((side) => side.clubId === clubId) ?? (clubId === round.coachClubId ? round.coach : null);
}

/** The competition's real mark where the game has one: the Brasileirão's top two series and the Copa do Brasil. */
function CompetitionLogo({ label, size }: { label: string; size: number }) {
  const logo = COMPETITION_LOGOS.find(({ prefix }) => label.startsWith(prefix));
  return logo ? <img className="crest" src={logo.src} height={size} alt="" /> : null;
}

function shootoutWinnerOf(result: AdvanceResult | null, fixtureId: string, clubs: Readonly<Record<string, RoundClub>>): string | null {
  const played = result?.events.find((e) => e.type === "matchPlayed" && e.fixture.id === fixtureId);
  const winnerId = played?.type === "matchPlayed" ? played.fixture.result?.penaltyWinnerId : undefined;
  return winnerId ? (clubs[winnerId]?.shortName ?? null) : null;
}

/** A score digit that rolls up into place when it changes, and on the board stands still again once its row's goal has been celebrated. */
function Digit({ value, className, flash, isSettled }: { value: number; className: string; flash?: string; isSettled?: boolean }) {
  const [still, setStill] = useState(value);
  useEffect(() => {
    if (isSettled) setStill(value);
  }, [isSettled]);
  const rolls = value !== still;
  return (
    <span className={className} style={flash ? { ["--flash" as string]: flash } : undefined}>
      <span key={value} className={rolls ? "roll" : undefined}>
        {value}
      </span>
    </span>
  );
}

const EVENT_ICONS: Partial<Record<EventKind, string>> = {
  goal: "ph-fill ph-soccer-ball",
  varCheck: "ph-fill ph-monitor-play",
  wrongCall: "ph-bold ph-megaphone",
  penaltyMiss: "ph-bold ph-target",
  injury: "ph-fill ph-first-aid",
  substitution: "ph-bold ph-arrows-left-right",
};

function EventMark({ kind }: { kind: EventKind }) {
  if (kind === "yellow") return <span className="yc" aria-hidden="true" />;
  if (kind === "red") return <span className="rc" aria-hidden="true" />;
  return <i className={`${EVENT_ICONS[kind] ?? ""} mk-${kind}`} aria-hidden="true" />;
}

type CoverProps = {
  round: LiveRound;
  match: MatchAt;
  formations: Record<Side, Formation>;
  /** Every human coach's board in a hot-seat round; none in a one-coach game. */
  seats: readonly Seat[];
  focus: number;
  onFocus: (index: number) => void;
  /** Whether the clock runs: the pitch plays only while it does. */
  isRunning: boolean;
  msPerMinute: number;
  label: string;
  minute: number;
  /** The minute the round ends: 90, or 120 when a match goes to extra time. */
  end: number;
  speed: Speed;
  golCount: number;
  /** The VAR check the round stands still for, if any. */
  varHold: VarHold | null;
  isOnlyMine: boolean;
  isFinished: boolean;
  shootoutWinner: string | null;
  table: ReactNode;
  onSpeed: (speed: Speed) => void;
  onOnlyMine: (isOnlyMine: boolean) => void;
  children: ReactNode;
};

/** Where the coach's match stands at `minute`, which ends at `end`: 90, or 120 after extra time. */
function clockNote(minute: number, speed: Speed, isFinished: boolean, end: number): string {
  if (isFinished || minute >= end) return "Fim de jogo";
  if (minute === HALF_TIME && speed === 0) return "Intervalo";
  if (minute === FULL_TIME && speed === 0) return "Fim do tempo normal";
  if (minute === EXTRA_HALF_TIME && speed === 0) return "Intervalo da prorrogação";
  if (minute > EXTRA_HALF_TIME) return "Prorrogação · 2º tempo";
  if (minute >= FULL_TIME) return "Prorrogação · 1º tempo";
  return minute > HALF_TIME ? "2º tempo" : "1º tempo";
}

/**
 * The coach's match as the cover of the round: the match playing on a little board, the score between the two
 * clubs' stickers, the clock and the controls. While the ball is in play the stickers give way to a slim
 * scoreboard above the board; a stop or a goal drops them back. In a hot-seat round every human coach gets a board.
 */
function Cover({ round, match, formations, seats, focus, onFocus, isRunning, msPerMinute, label, minute, end, speed, golCount, varHold, isOnlyMine, isFinished, shootoutWinner, table, onSpeed, onOnlyMine, children }: CoverProps) {
  // The cover builds itself only at kick-off, not when the coach comes back to a match under way.
  const [isKickOff] = useState(minute === 0);
  const isStopped = isFinished || minute >= end;
  // The coach's clock stops when his match does, though another match of the round plays on to extra time.
  const matchEnd = Math.min(end, matchEndOf(match.events));
  const { isLifted, isGoalHeld } = useStickerLift(match.score.home + match.score.away, isRunning && minute >= 1 && !isStopped);
  const home = round.clubs[match.homeId];
  const away = round.clubs[match.awayId];
  if (!home || !away) return null;
  // The goal VAR is checking shows under the score once the decision is in.
  const isChecking = varHold?.phase === "checking" && varHold.fixtureId === match.fixtureId;
  const scorers = scorersUntil(round, match.fixtureId, isChecking ? minute - 1 : minute);
  const hasSeats = seats.length > 1;
  const [competition, roundName] = label.split(" · ");
  const side = (club: RoundClub, where: Side) => (
    <div className={`stk live-tm ${where === "home" ? "h" : "a"}${club.id === round.coachClubId ? " you" : ""}`}>
      {match.reds[where] > 0 && <span className="rc live-tm-red" aria-label="expulsão" />}
      <Crest club={club} size={54} />
      <b>{club.shortName}</b>
      <small>{club.id === round.coachClubId ? "Seu time" : where === "home" ? "Mandante" : "Visitante"}</small>
    </div>
  );
  return (
    <section className={`live-cover has-pitch${hasSeats ? " has-seats" : ""}${isKickOff ? " round-kickoff" : ""}${varHold && varHold.phase !== "leaving" ? " is-var" : ""}`} aria-label="Seu jogo">
      {golCount > 0 && (
        <div key={golCount} className="gol-sweep" aria-hidden="true">
          GOL
        </div>
      )}
      {varHold && (
        <VarSticker
          key={`${varHold.fixtureId}-${varHold.check.minute}`}
          check={varHold.check}
          phase={varHold.phase}
          name={round.names[varHold.check.playerId] ?? "Um jogador"}
          club={round.clubs[varHold.check.clubId]?.shortName ?? ""}
        />
      )}
      <div className="live-ttl" data-tauri-drag-region>
        <h1>
          <CompetitionLogo label={label} size={30} />
          {competition}
          <span>{[roundName, formatBarDate(round.date)].filter(Boolean).join(" · ")}</span>
        </h1>
        <div className="live-tools">
          {(speed === 0 || varHold) && !isFinished && minute < end && (
            <span className="chip wait live-paused">
              <i className="ph-fill ph-pause" aria-hidden="true" />
              {varHold ? "Revisão do VAR" : "Pausado"}
            </span>
          )}
          <div className="live-clock">
            <span>{clockNote(minute, speed, isFinished, matchEnd)}</span>
            <span className="live-track" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(minute, matchEnd) / matchEnd})` }} />
            </span>
            <b aria-label="Minuto">{varHold ? "VAR" : `${Math.min(minute, matchEnd)}'`}</b>
          </div>
          <div className="live-speed" role="group" aria-label="Velocidade">
            <button aria-label="Pausar" aria-pressed={speed === 0} disabled={isStopped} onClick={() => onSpeed(0)}>
              <i className="ph-fill ph-pause" aria-hidden="true" />
            </button>
            {SPEEDS.map((s) => (
              <button key={s} aria-label={`${s}x`} aria-pressed={speed === s} disabled={isStopped} onClick={() => onSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <label className="live-mine">
            Só meus jogos
            <input type="checkbox" className="live-sw" checked={isOnlyMine} onChange={(event) => onOnlyMine(event.target.checked)} />
          </label>
        </div>
      </div>
      <div className="live-feat">
        {hasSeats ? (
          <HotSeatPitches seats={seats} focus={focus} onFocus={onFocus} round={round} minute={minute} isRunning={isRunning} msPerMinute={msPerMinute} />
        ) : (
          <>
            <div className="live-stad">
              <b>{match.ground ?? home.stadium}</b>
              {match.ground ? "Campo neutro" : `${home.shortName} em casa`}
              {(match.officials?.referee || match.officials?.hasVar) && (
                <div className="live-ref">
                  {match.officials.hasVar && <em>VAR</em>}
                  {match.officials.referee && `Árbitro ${match.officials.referee}`}
                </div>
              )}
            </div>
            <div className={`live-mid${isLifted ? " is-lifted" : ""}${isGoalHeld ? " is-goal" : ""}`}>
              <div className="live-pitch">
                <LivePitch match={match} clubs={round.clubs} names={round.names} minute={minute} isRunning={isRunning} msPerMinute={msPerMinute} formations={formations} />
              </div>
              <div className="live-mini" aria-hidden="true">
                <MiniScore home={home} away={away} score={match.score} />
              </div>
              <div className="live-duel">
                {side(home, "home")}
                <p className="live-sc" aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
                  <Digit value={match.score.home} className="digit" />
                  <span className="x">×</span>
                  <Digit value={match.score.away} className="digit" />
                </p>
                {side(away, "away")}
              </div>
              <div className="live-evs">
                {shootoutWinner ? (
                  <span className="last">{shootoutWinner} nos pênaltis</span>
                ) : (
                  scorers.map((goal, index) => (
                    <span key={`${goal.minute}-${index}`} className={index === scorers.length - 1 ? "last" : undefined}>
                      <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
                      {goal.name} {goal.minute}'{goal.kind && GOAL_NOTES[goal.kind] ? ` (${GOAL_NOTES[goal.kind]})` : ""}
                    </span>
                  ))
                )}
              </div>
            </div>
          </>
        )}
        <div className="live-right">
          {table}
          {children}
        </div>
      </div>
    </section>
  );
}

type MatchRowProps = { match: MatchAt; clubs: Readonly<Record<string, RoundClub>>; flash: Flash | undefined; alert: Alert | undefined; isHidden: boolean; onOpen: (fixtureId: string) => void };

/** A row redraws only when its own match changes, so a whole round's board stays light at 4x. */
const isSameRow = (before: MatchRowProps, after: MatchRowProps) =>
  before.clubs === after.clubs &&
  before.flash === after.flash &&
  before.alert === after.alert &&
  before.isHidden === after.isHidden &&
  before.onOpen === after.onOpen &&
  before.match.isHuman === after.match.isHuman &&
  before.match.score.home === after.match.score.home &&
  before.match.score.away === after.match.score.away &&
  before.match.reds.home === after.match.reds.home &&
  before.match.reds.away === after.match.reds.away &&
  before.match.isInExtraTime === after.match.isInExtraTime &&
  before.match.last?.minute === after.match.last?.minute &&
  before.match.last?.text === after.match.last?.text;

const MatchRow = memo(function MatchRow({ match, clubs, flash, alert, isHidden, onOpen }: MatchRowProps) {
  const home = clubs[match.homeId];
  const away = clubs[match.awayId];
  if (!home || !away) return null;
  const lead = (side: Side) => (side === "home" ? match.score.home > match.score.away : match.score.away > match.score.home);
  return (
    <li className={match.isHuman ? "live-r human" : "live-r"} hidden={isHidden} aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
      {flash && <i key={flash.count} className="flash" style={{ background: `linear-gradient(90deg, transparent 12%, ${flash.colour} 40%, transparent 95%)` }} />}
      <button type="button" className="live-open" aria-label={`Ficha do jogo: ${home.shortName} x ${away.shortName}`} onClick={() => onOpen(match.fixtureId)} />
      <span className="std">
        <DerbyBadgeOf homeId={match.homeId} awayId={match.awayId} />
        <span className="std-nm">{match.ground ?? home.stadium}</span>
      </span>
      <RowPlate club={home} red={match.reds.home > 0} />
      <Digit value={match.score.home} className={lead("home") ? "sbox lead" : "sbox"} flash={flash?.side === "home" ? flash.colour : undefined} isSettled={!flash} />
      <Digit value={match.score.away} className={lead("away") ? "sbox lead" : "sbox"} flash={flash?.side === "away" ? flash.colour : undefined} isSettled={!flash} />
      <RowPlate club={away} red={match.reds.away > 0} />
      <span className="ev">
        {flash && (
          <span key={flash.count} className="gol">
            Gol
          </span>
        )}
        {alert && !flash && (
          <span key={alert.count} className={`gol ${ALERT_CHIPS[alert.kind].className}`} {...(alert.who ? { title: `Auxiliar: dia ruim de ${alert.who}` } : {})}>
            {ALERT_CHIPS[alert.kind].label}
            {alert.who && ` · ${alert.who}`}
          </span>
        )}
        {match.isInExtraTime && <span className="prorr">Prorr.</span>}
        {match.last && (
          <>
            <EventMark kind={match.last.kind} />
            <span className="who">{match.last.text}</span>
            <span className="mn">{match.last.minute}'</span>
          </>
        )}
      </span>
    </li>
  );
}, isSameRow);

/** A club on the round board: its crest on a pill in its colours, as Brasfoot paints it. */
function RowPlate({ club, red }: { club: RoundClub; red: boolean }) {
  const { background, text } = plateColours(club.colours);
  return (
    <span className="plate" style={{ background, color: text }}>
      <Crest club={club} size={17} />
      <span className="nm">{club.shortName}</span>
      {red && <span className="rc" aria-label="expulsão" />}
    </span>
  );
}

/** The coach's group as it would stand now, three rows around his club, over the button that opens it whole. */
function TableCard({ rows, clubs, coachClubId, onOpen }: { rows: readonly LiveTableRow[]; clubs: Readonly<Record<string, RoundClub>>; coachClubId: string | null; onOpen: () => void }) {
  return (
    <div className="live-table">
      <TableRows rows={shortTable(rows, coachClubId, TABLE_CARD_ROWS)} clubs={clubs} coachClubId={coachClubId} />
      <button className="live-table-open" onClick={onOpen}>
        Tabela completa
      </button>
    </div>
  );
}

/** The full table over the round, closed by its button, a click outside it or Escape. */
function TableSheet({ note, onClose, children }: { note: string; onClose: () => void; children: ReactNode }) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  return createPortal(
    <div className="sheet-wrap" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="tsheet page" role="dialog" aria-modal="true" aria-labelledby="full-table-title">
        <header className="tsheet-head">
          <div>
            <h2 id="full-table-title" ref={title} tabIndex={-1}>
              Classificação
            </h2>
            <span>{note}</span>
          </div>
          <button className="btn sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="trow trow-head" aria-hidden="true">
          <span>#</span>
          <span>Clube</span>
          <span className="g">J</span>
          <span className="g">V</span>
          <span className="g">SG</span>
          <span className="g">P</span>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

const ROSE = "rgba(17, 132, 66, 0.2)";
const FELL = "rgba(215, 50, 42, 0.16)";

/** A table row slides to its new place, tinted green if it rose and red if it fell; with reduced motion only the tint fades. */
function slideTableRow(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  const tint = offset > 0 ? ROSE : FELL;
  const slides = !prefersReducedMotion();
  const at = (y: number) => (slides ? { transform: `translateY(${y}px)` } : {});
  row.animate(
    [
      { ...at(offset), boxShadow: `inset 0 0 0 999px ${tint}` },
      { ...at(0), boxShadow: `inset 0 0 0 999px ${tint}`, offset: 0.55 },
      { ...at(0), boxShadow: "inset 0 0 0 999px transparent" },
    ],
    { duration: 1500, delay: 180, easing: EXPO_OUT, fill: "backwards" },
  );
}

/** Table rows that slide to their new places when the order changes (FLIP). */
function TableRows({ rows, clubs, coachClubId, isFull = false }: { rows: readonly LiveTableRow[]; clubs: Readonly<Record<string, RoundClub>>; coachClubId: string | null; isFull?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, rows.map((r) => r.clubId).join(), slideTableRow);

  return (
    <ol ref={list} className={isFull ? "trows full" : "trows"} aria-label={isFull ? "Tabela completa" : "Classificação ao vivo"}>
      {rows.map((r) => {
        const club = clubs[r.clubId];
        return (
          <li key={r.clubId} data-flip={r.clubId} className={r.clubId === coachClubId ? "trow mine" : "trow"}>
            <span className="p">{r.position}</span>
            <span className="n">
              {club && <Crest club={club} size={isFull ? 20 : 16} />}
              {club?.shortName ?? r.clubId}
            </span>
            {isFull && (
              <>
                <span className="g">{r.played}</span>
                <span className="g">{r.wins}</span>
                <span className="g">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>
              </>
            )}
            {!isFull && <span className={r.move > 0 ? "mv up" : "mv down"}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ""}</span>}
            <span className="pts">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}
