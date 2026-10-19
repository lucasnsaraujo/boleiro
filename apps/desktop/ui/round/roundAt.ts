import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { VarCheck } from "@boleiro/engine/sim/referees/refereeCalls";
import { VAR_WORDS, WRONG_CALL_WORDS } from "@boleiro/game-client/format/refereeCallWords";
import { badDaysOf } from "@boleiro/engine/sim/live/matchPlay";
import { EXTRA_HALF_TIME, FULL_TIME, HALF_TIME, isWhistle, matchEndOf, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { CoachSide, LiveRound, RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";

export type EventKind = "goal" | "penaltyMiss" | "yellow" | "red" | "injury" | "substitution" | "varCheck" | "wrongCall";
/** A match event as the rows and the band print it, like a radio ticker: "Gol de Arrascaeta". */
export type ShownEvent = { kind: EventKind; minute: number; side: Side; text: string };
export type Score = { home: number; away: number };
/** One match at a minute of the round: the score so far, red cards and its latest event. */
/** A match at a minute; `isHuman` when the coach's or a hot-seat coach's club plays it, `isInExtraTime` from its ninety minutes' end on. */
export type MatchAt = RoundMatch & { score: Score; reds: Score; last: ShownEvent | null; isCoach: boolean; isHuman: boolean; isInExtraTime: boolean };

/** What happened during the match to a player; the whistles and the shootout after the last one are not. */
type PlayerEvent = Exclude<MatchEvent, { type: "halfTime" | "fullTime" | "extraHalfTime" | "extraTimeEnd" | "shootoutKick" | "orderOverruled" }>;

function kindOf(event: PlayerEvent): EventKind {
  if (event.type === "card") return event.card === "yellow" ? "yellow" : "red";
  return event.type;
}

const GOAL_WORDS: Record<GoalKind, string> = {
  openPlay: "Gol de",
  header: "Gol de cabeça de",
  penalty: "Gol de pênalti de",
  freeKick: "Gol de falta de",
  olympic: "Gol olímpico de",
  ownGoal: "Gol contra de",
};

function eventText(event: PlayerEvent, names: Readonly<Record<string, string>>): string {
  const name = names[event.playerId] ?? "Um jogador";
  switch (event.type) {
    case "goal": {
      const assist = event.assistId ? `, passe de ${names[event.assistId] ?? "um companheiro"}` : "";
      return `${GOAL_WORDS[event.kind ?? "openPlay"]} ${name}${assist}`;
    }
    case "penaltyMiss":
      return event.isSaved ? `${names[event.keeperId] ?? "O goleiro"} defende o pênalti de ${name}` : `${name} perde o pênalti`;
    case "card":
      return event.card === "yellow" ? `Amarelo para ${name}` : `Expulso: ${name}`;
    case "injury":
      return `${name} se machucou`;
    case "substitution":
      return `Entra ${name}, sai ${names[event.offId] ?? "um jogador"}`;
    case "varCheck":
      return VAR_WORDS[event.decision](name);
    case "wrongCall":
      return WRONG_CALL_WORDS[event.call](name);
  }
}

const isPlayerEvent = (event: MatchEvent): event is PlayerEvent => !isWhistle(event) && event.type !== "shootoutKick" && event.type !== "orderOverruled";

function matchAt(round: LiveRound, match: RoundMatch, minute: number, underReview: string | null): MatchAt {
  const score = { home: 0, away: 0 };
  const reds = { home: 0, away: 0 };
  let last: ShownEvent | null = null;
  for (const event of match.events) {
    if (event.minute > minute) break;
    if (!isPlayerEvent(event)) continue;
    const side: Side = event.clubId === match.homeId ? "home" : "away";
    // A check still running at this minute keeps its decision to itself: the goal or red card it rules on counts once it ends.
    if (event.minute === minute && match.fixtureId === underReview) {
      last = { kind: "varCheck", minute, side, text: "VAR revisando o lance" };
      continue;
    }
    const kind = kindOf(event);
    if (kind === "goal") score[side]++;
    if (kind === "red") reds[side]++;
    last = { kind, minute: event.minute, side, text: eventText(event, round.names) };
  }
  const isCoach = match.fixtureId === round.coach?.fixtureId;
  const isOtherHuman = round.otherHumanClubIds?.some((id) => id === match.homeId || id === match.awayId) ?? false;
  const isInExtraTime = minute >= FULL_TIME && matchEndOf(match.events) > FULL_TIME;
  return { ...match, score, reds, last, isCoach, isHuman: isCoach || isOtherHuman, isInExtraTime };
}

/**
 * Every match of the round at `minute`, the coach's first, then the other hot-seat coaches'. The
 * match whose VAR check the round stands still for (`underReview`) doesn't tell the decision yet.
 */
export function roundAt(round: LiveRound, minute: number, underReview: string | null = null): MatchAt[] {
  return round.matches.map((match) => matchAt(round, match, minute, underReview)).sort((a, b) => Number(b.isCoach) - Number(a.isCoach) || Number(b.isHuman) - Number(a.isHuman));
}

/** The goals scored after minute `from` up to minute `to`, in order. */
export function goalsBetween(round: LiveRound, from: number, to: number): { fixtureId: string; side: Side; clubId: string }[] {
  return round.matches.flatMap((match) =>
    match.events.flatMap((event) =>
      event.type === "goal" && event.minute > from && event.minute <= to
        ? [{ fixtureId: match.fixtureId, side: event.clubId === match.homeId ? ("home" as const) : ("away" as const), clubId: event.clubId }]
        : [],
    ),
  );
}

/** A moment the board makes a show of; a player having a bad day comes with who he is. */
export type Highlight =
  | { fixtureId: string; kind: "goal" | "penaltyMiss" | "red" | "var" | "plan"; side: Side; clubId: string }
  | { fixtureId: string; kind: "badDay"; side: Side; clubId: string; playerId: string };

/**
 * The moments of a stretch of minutes the board makes a show of, in order: goals, missed penalties,
 * red cards, VAR changing a call and the substitutions a match plan made, then the human coaches'
 * players the assistant notices having a bad day.
 */
export function highlightsBetween(round: LiveRound, from: number, to: number): Highlight[] {
  const humanClubIds = new Set([round.coachClubId, ...(round.otherHumanClubIds ?? [])]);
  return round.matches.flatMap((match) => {
    const sideOf = (clubId: string): Side => (clubId === match.homeId ? "home" : "away");
    const moments = match.events.flatMap((event): Highlight[] => {
      if (!isPlayerEvent(event) || event.minute <= from || event.minute > to) return [];
      if (event.type === "varCheck") return event.decision === "goalStands" ? [] : [{ fixtureId: match.fixtureId, kind: "var", side: sideOf(event.clubId), clubId: event.clubId }];
      if (event.type === "substitution") return event.byPlan ? [{ fixtureId: match.fixtureId, kind: "plan", side: sideOf(event.clubId), clubId: event.clubId }] : [];
      const kind = kindOf(event);
      if (kind !== "goal" && kind !== "penaltyMiss" && kind !== "red") return [];
      return [{ fixtureId: match.fixtureId, kind, side: sideOf(event.clubId), clubId: event.clubId }];
    });
    const badDays = match.play
      ? badDaysOf(match.play, match.events).flatMap(({ playerId, clubId, minute }): Highlight[] =>
          humanClubIds.has(clubId) && minute > from && minute <= to ? [{ fixtureId: match.fixtureId, kind: "badDay", side: sideOf(clubId), clubId, playerId }] : [],
        )
      : [];
    return [...moments, ...badDays];
  });
}

/** What a row of the board calls out on a chip; a bad day names every player the assistant noticed. */
export type Callout = { fixtureId: string; kind: Exclude<Highlight["kind"], "goal">; who?: string };

/**
 * One callout per row for a stretch of minutes, goals left to their own celebration: its latest red
 * card or missed penalty, else the players the assistant noticed having a bad day, named together.
 */
export function calloutsBetween(round: LiveRound, from: number, to: number): Callout[] {
  const called = new Map<string, Callout>();
  for (const h of highlightsBetween(round, from, to)) {
    if (h.kind === "goal") continue;
    const before = called.get(h.fixtureId);
    if (h.kind !== "badDay") called.set(h.fixtureId, { fixtureId: h.fixtureId, kind: h.kind });
    else if (!before || before.kind === "badDay") {
      const name = round.names[h.playerId] ?? "Um jogador";
      called.set(h.fixtureId, { fixtureId: h.fixtureId, kind: "badDay", who: before?.who ? `${before.who}, ${name}` : name });
    }
  }
  return [...called.values()];
}

const isIncidentOf = (e: MatchEvent, clubId: string) => (e.type === "injury" || (e.type === "card" && e.card !== "yellow")) && e.clubId === clubId;

/** Whether a red card or injury of a human coach's side at `minute` stops the round: neither his match plan answered it nor the house rule left his match to the plan. */
function waitsForCoach(side: CoachSide, events: readonly MatchEvent[], clubId: string, minute: number): boolean {
  if (side.incidentHandling === "matchPlan") return false;
  const answered = side.answeredByPlan ?? [];
  return events.some((e) => e.minute === minute && isIncidentOf(e, clubId) && "playerId" in e && !answered.some((a) => a.minute === minute && a.playerId === e.playerId));
}

/**
 * The VAR check a human coach's match stops for at `minute`, if any: the round stands still while it
 * runs. A check that only confirms a goal stops nothing.
 */
export function varCheckAt(round: LiveRound, minute: number): { fixtureId: string; check: VarCheck } | null {
  const humanClubIds = new Set([round.coachClubId, ...(round.otherHumanClubIds ?? [])]);
  for (const match of round.matches) {
    if (!humanClubIds.has(match.homeId) && !humanClubIds.has(match.awayId)) continue;
    const check = match.events.find((e): e is VarCheck => e.type === "varCheck" && e.minute === minute && e.decision !== "goalStands");
    if (check) return { fixtureId: match.fixtureId, check };
  }
  return null;
}

/** The minute the round ends: 120 when one of its matches goes to extra time, else 90. */
export function roundEndOf(round: LiveRound): number {
  return Math.max(FULL_TIME, ...round.matches.map((match) => matchEndOf(match.events)));
}

/**
 * Why the round stops by itself at `minute`: half-time, extra time's breaks (before it and at its
 * half-time), the final whistle, or something that needs a coach in his match: a red card or an
 * injury to any human coach's side that his match plan did not answer, in a match that asks him. A
 * goal never stops it.
 */
export function pauseReason(round: LiveRound, minute: number): "halfTime" | "extraTimeBreak" | "fullTime" | "coachMatch" | null {
  const end = roundEndOf(round);
  if (minute >= end) return "fullTime";
  if (minute === HALF_TIME) return "halfTime";
  if (minute === FULL_TIME || minute === EXTRA_HALF_TIME) return "extraTimeBreak";
  const coachClubId = round.coachClubId;
  const match = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const needsCoach = !!match && !!coachClubId && !!round.coach && waitsForCoach(round.coach, match.events, coachClubId, minute);
  const needsOther = (round.humanSides ?? []).some((side) => round.matches.some((m) => m.fixtureId === side.fixtureId && waitsForCoach(side, m.events, side.clubId, minute)));
  return needsCoach || needsOther ? "coachMatch" : null;
}

/** Who scored in a match up to `minute`, in order, as the band lists them under the score; `side` is the side the goal counts for. */
export function scorersUntil(round: LiveRound, fixtureId: string, minute: number): { name: string; minute: number; side: Side; kind?: GoalKind }[] {
  const match = round.matches.find((m) => m.fixtureId === fixtureId);
  if (!match) return [];
  return match.events.flatMap((event) =>
    event.type === "goal" && event.minute <= minute
      ? [
          {
            name: round.names[event.playerId] ?? "Um jogador",
            minute: event.minute,
            side: event.clubId === match.homeId ? ("home" as const) : ("away" as const),
            ...(event.kind ? { kind: event.kind } : {}),
          },
        ]
      : [],
  );
}
