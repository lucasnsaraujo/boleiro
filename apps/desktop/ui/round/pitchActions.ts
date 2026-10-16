import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import { missedShotsOf } from "@boleiro/engine/sim/live/matchPlay";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";

/** Where a strike starts when it isn't open play: the spot, a free kick outside the box, the corner flag. */
export type SetPiece = "penalty" | "freeKick" | "corner";

/**
 * Something real the live pitch plays at its minute, with the short tag its player carries for a moment:
 * a goal, a chance that comes to nothing, a card, an injury, a substitution, the half-time whistle.
 * `playerId` is whose token it shows on; for a substitution, the player going off, whose token turns over.
 */
export type PitchAction =
  | { kind: "goal"; minute: number; side: Side; playerId: string; tag: string; setPiece: SetPiece | null }
  | { kind: "chance"; minute: number; side: Side; playerId: string; tag: string; outcome: "saved" | "wide"; setPiece: SetPiece | null }
  | { kind: "card"; minute: number; side: Side; playerId: string; tag: string; card: "yellow" | "red" }
  | { kind: "injury"; minute: number; side: Side; playerId: string; tag: string }
  | { kind: "substitution"; minute: number; side: Side; playerId: string; tag: string }
  | { kind: "halfTime"; minute: number };

const GOAL_TAGS: Record<GoalKind, string> = { openPlay: "", header: ", de cabeça", penalty: ", de pênalti", freeKick: ", de falta", olympic: ", olímpico", ownGoal: ", contra" };
const SET_PIECES: Partial<Record<GoalKind, SetPiece>> = { penalty: "penalty", freeKick: "freeKick", olympic: "corner" };

function actionOf(event: MatchEvent, sideOf: (clubId: string) => Side, nameOf: (playerId: string) => string): PitchAction | null {
  switch (event.type) {
    case "goal": {
      const kind = event.kind ?? "openPlay";
      return { kind: "goal", minute: event.minute, side: sideOf(event.clubId), playerId: event.playerId, tag: `${nameOf(event.playerId)}${GOAL_TAGS[kind]}`, setPiece: SET_PIECES[kind] ?? null };
    }
    case "penaltyMiss":
      return {
        kind: "chance",
        minute: event.minute,
        side: sideOf(event.clubId),
        playerId: event.playerId,
        tag: event.isSaved ? `${nameOf(event.playerId)} bate, ${nameOf(event.keeperId)} defende` : `${nameOf(event.playerId)} perde o pênalti`,
        outcome: event.isSaved ? "saved" : "wide",
        setPiece: "penalty",
      };
    case "card":
      return event.card === "yellow"
        ? { kind: "card", minute: event.minute, side: sideOf(event.clubId), playerId: event.playerId, tag: `Amarelo para ${nameOf(event.playerId)}`, card: "yellow" }
        : { kind: "card", minute: event.minute, side: sideOf(event.clubId), playerId: event.playerId, tag: `Expulso: ${nameOf(event.playerId)}`, card: "red" };
    case "injury":
      return { kind: "injury", minute: event.minute, side: sideOf(event.clubId), playerId: event.playerId, tag: `${nameOf(event.playerId)} se machucou` };
    case "substitution":
      return { kind: "substitution", minute: event.minute, side: sideOf(event.clubId), playerId: event.offId, tag: `Entra ${nameOf(event.playerId)}, sai ${nameOf(event.offId)}` };
    case "halfTime":
      return { kind: "halfTime", minute: event.minute };
    case "fullTime":
    case "shootoutKick":
    case "orderOverruled":
      return null;
  }
}

/**
 * What the live pitch plays of a match: every real event of its ninety minutes as a pitch action and, when the
 * match has its players' play, every shot that doesn't go in, all in minute order. The passes and the build-up
 * around them are the board's own presentation.
 */
export function pitchActionsOf(match: RoundMatch, names: Readonly<Record<string, string>>): PitchAction[] {
  const sideOf = (clubId: string): Side => (clubId === match.homeId ? "home" : "away");
  const nameOf = (playerId: string) => names[playerId] ?? "Um jogador";
  const events = match.events.flatMap((event) => {
    const action = actionOf(event, sideOf, nameOf);
    return action ? [action] : [];
  });
  const shots = (match.play ? missedShotsOf(match.play, match.events) : []).map(
    ({ minute, clubId, playerId, isOnTarget }): PitchAction => ({
      kind: "chance",
      minute,
      side: sideOf(clubId),
      playerId,
      tag: isOnTarget ? `${nameOf(playerId)} chuta, o goleiro defende` : `${nameOf(playerId)} chuta pra fora`,
      outcome: isOnTarget ? "saved" : "wide",
      setPiece: null,
    }),
  );
  // Minute 45 is first-half stoppage time: its shots come before the half-time whistle.
  return [...events, ...shots].sort((a, b) => a.minute - b.minute || Number(a.kind === "halfTime") - Number(b.kind === "halfTime"));
}
