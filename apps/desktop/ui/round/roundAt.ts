import { FULL_TIME, HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { LiveRound, RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";

export type EventKind = "goal" | "yellow" | "red" | "injury" | "substitution";
/** A match event as the rows and the band print it, like a radio ticker: "Gol de Arrascaeta". */
export type ShownEvent = { kind: EventKind; minute: number; side: Side; text: string };
export type Score = { home: number; away: number };
/** One match at a minute of the round: the score so far, red cards and its latest event. */
export type MatchAt = RoundMatch & { score: Score; reds: Score; last: ShownEvent | null; isCoach: boolean };

type PlayerEvent = Exclude<MatchEvent, { type: "halfTime" } | { type: "fullTime" }>;

function kindOf(event: PlayerEvent): EventKind {
  if (event.type === "card") return event.card === "yellow" ? "yellow" : "red";
  return event.type;
}

function eventText(event: PlayerEvent, names: Readonly<Record<string, string>>): string {
  const name = names[event.playerId] ?? "Um jogador";
  switch (event.type) {
    case "goal":
      return `Gol de ${name}`;
    case "card":
      return event.card === "yellow" ? `Amarelo para ${name}` : `Expulso: ${name}`;
    case "injury":
      return `${name} se machucou`;
    case "substitution":
      return `Entra ${name}, sai ${names[event.offId] ?? "um jogador"}`;
  }
}

const isPlayerEvent = (event: MatchEvent): event is PlayerEvent => event.type !== "halfTime" && event.type !== "fullTime";

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
  return { ...match, score, reds, last, isCoach: match.fixtureId === round.coach?.fixtureId };
}

/** Every match of the round at `minute`, the coach's first. */
export function roundAt(round: LiveRound, minute: number): MatchAt[] {
  return round.matches.map((match) => matchAt(round, match, minute)).sort((a, b) => Number(b.isCoach) - Number(a.isCoach));
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

/** Why the round stops by itself at `minute`: half-time, the final whistle, or something that needs the coach in his match. */
export function pauseReason(round: LiveRound, minute: number): "halfTime" | "fullTime" | "coachMatch" | null {
  if (minute >= FULL_TIME) return "fullTime";
  if (minute === HALF_TIME) return "halfTime";
  const coachClubId = round.coachClubId;
  const match = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  if (!match || !coachClubId) return null;
  const needsCoach = match.events.some(
    (e) =>
      e.minute === minute &&
      ((e.type === "injury" && e.clubId === coachClubId) ||
        (e.type === "card" && e.card !== "yellow" && e.clubId === coachClubId) ||
        (e.type === "goal" && e.clubId !== coachClubId)),
  );
  return needsCoach ? "coachMatch" : null;
}

/** Who scored in a match up to `minute`, in order, as the band lists them under the score. */
export function scorersUntil(round: LiveRound, fixtureId: string, minute: number): { name: string; minute: number; side: Side }[] {
  const match = round.matches.find((m) => m.fixtureId === fixtureId);
  if (!match) return [];
  return match.events.flatMap((event) =>
    event.type === "goal" && event.minute <= minute
      ? [{ name: round.names[event.playerId] ?? "Um jogador", minute: event.minute, side: event.clubId === match.homeId ? ("home" as const) : ("away" as const) }]
      : [],
  );
}
