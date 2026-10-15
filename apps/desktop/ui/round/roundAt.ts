import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import { FULL_TIME, HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { LiveRound, RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";

export type EventKind = "goal" | "penaltyMiss" | "yellow" | "red" | "injury" | "substitution";
/** A match event as the rows and the band print it, like a radio ticker: "Gol de Arrascaeta". */
export type ShownEvent = { kind: EventKind; minute: number; side: Side; text: string };
export type Score = { home: number; away: number };
/** One match at a minute of the round: the score so far, red cards and its latest event. */
/** A match at a minute; `isHuman` when the coach's or a hot-seat coach's club plays it. */
export type MatchAt = RoundMatch & { score: Score; reds: Score; last: ShownEvent | null; isCoach: boolean; isHuman: boolean };

/** What happened during the ninety minutes to a player; the whistles and the shootout after full time are not. */
type PlayerEvent = Exclude<MatchEvent, { type: "halfTime" | "fullTime" | "shootoutKick" | "orderOverruled" }>;

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
  }
}

const isPlayerEvent = (event: MatchEvent): event is PlayerEvent =>
  event.type !== "halfTime" && event.type !== "fullTime" && event.type !== "shootoutKick" && event.type !== "orderOverruled";

function matchAt(round: LiveRound, match: RoundMatch, minute: number): MatchAt {
  const score = { home: 0, away: 0 };
  const reds = { home: 0, away: 0 };
  let last: ShownEvent | null = null;
  for (const event of match.events) {
    if (event.minute > minute) break;
    if (!isPlayerEvent(event)) continue;
    const side: Side = event.clubId === match.homeId ? "home" : "away";
    const kind = kindOf(event);
    if (kind === "goal") score[side]++;
    if (kind === "red") reds[side]++;
    last = { kind, minute: event.minute, side, text: eventText(event, round.names) };
  }
  const isCoach = match.fixtureId === round.coach?.fixtureId;
  const isOtherHuman = round.otherHumanClubIds?.some((id) => id === match.homeId || id === match.awayId) ?? false;
  return { ...match, score, reds, last, isCoach, isHuman: isCoach || isOtherHuman };
}

/** Every match of the round at `minute`, the coach's first, then the other hot-seat coaches'. */
export function roundAt(round: LiveRound, minute: number): MatchAt[] {
  return round.matches.map((match) => matchAt(round, match, minute)).sort((a, b) => Number(b.isCoach) - Number(a.isCoach) || Number(b.isHuman) - Number(a.isHuman));
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

export type Highlight = { fixtureId: string; kind: "goal" | "penaltyMiss" | "red"; side: Side; clubId: string };

/** The moments of a stretch of minutes the board makes a show of, in order: goals, missed penalties and red cards. */
export function highlightsBetween(round: LiveRound, from: number, to: number): Highlight[] {
  return round.matches.flatMap((match) =>
    match.events.flatMap((event): Highlight[] => {
      if (!isPlayerEvent(event) || event.minute <= from || event.minute > to) return [];
      const kind = kindOf(event);
      if (kind !== "goal" && kind !== "penaltyMiss" && kind !== "red") return [];
      return [{ fixtureId: match.fixtureId, kind, side: event.clubId === match.homeId ? "home" : "away", clubId: event.clubId }];
    }),
  );
}

const isIncidentOf = (e: MatchEvent, clubId: string) => (e.type === "injury" || (e.type === "card" && e.card !== "yellow")) && e.clubId === clubId;

/**
 * Why the round stops by itself at `minute`: half-time, the final whistle, or something that needs
 * a coach in his match: a goal against the seated coach, or a red card or an injury to any human
 * coach's side.
 */
export function pauseReason(round: LiveRound, minute: number): "halfTime" | "fullTime" | "coachMatch" | null {
  if (minute >= FULL_TIME) return "fullTime";
  if (minute === HALF_TIME) return "halfTime";
  const coachClubId = round.coachClubId;
  const match = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const needsCoach =
    !!match && !!coachClubId && match.events.some((e) => e.minute === minute && "clubId" in e && (isIncidentOf(e, coachClubId) || (e.type === "goal" && e.clubId !== coachClubId)));
  const needsOther = (round.humanSides ?? []).some((side) =>
    round.matches.some((m) => m.fixtureId === side.fixtureId && m.events.some((e) => e.minute === minute && isIncidentOf(e, side.clubId))),
  );
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
