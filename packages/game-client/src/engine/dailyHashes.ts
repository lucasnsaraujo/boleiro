import type { IsoDate } from "@boleiro/engine/sim/gameState";
import { hashShards } from "../saves/hashShards.js";
import { isHumanMatchDay } from "../hub/hotSeat.js";
import { isCoachMatchDay } from "../hub/playToMatchDay.js";
import type { CoachSide } from "../round/liveRoundOf.js";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession, type EngineSession, type NewGameChoices } from "./createEngineSession.js";

/**
 * A game to play the same way on any JavaScript engine: its seed, its new-game choices and how many days to hash,
 * from `hashFrom` on when given (the days before it are played the same way, unhashed, which is cheaper).
 */
export type DailyHashScript = { seed: number; choices: NewGameChoices; days: number; hashFrom?: IsoDate; dumpOn?: IsoDate };
/** The save's shards after a day, each as its SHA-256. */
export type DayHash = { date: IsoDate; shards: Record<string, string> };

const SUBSTITUTION_MINUTE = 60;

/** Everything waiting for the coach in the seat, seen through or left to his assistant, as a player who just clicks on would. */
function clearDesk(session: EngineSession) {
  for (let point = session.turningPoint(); point; point = session.turningPoint()) session.apply({ type: "closeTurningPoint" });
  for (let moment = session.moment(); moment; moment = session.moment()) session.apply({ type: "closeMoment" });
  for (let event = session.pendingEvent(); event; event = session.pendingEvent()) session.apply({ type: "answerEvent", choice: null });
}

/** A human side's last starter off for its first substitute, as a coach who reacts mid-match would. */
function substitute(session: EngineSession, side: CoachSide, clubId?: string) {
  const offId = side.starters.at(-1);
  const onId = side.benchIds[0];
  if (!offId || !onId) return;
  try {
    session.apply({ type: "changeLive", minute: SUBSTITUTION_MINUTE, change: { substitutions: [{ offId, onId }] }, ...(clubId ? { clubId } : {}) });
  } catch (error) {
    // The starter was sent off or replaced before the hour, or the substitute came on already: the match plays on
    // without the change, on every engine alike. Anything else means the script no longer plays a match as the app does.
    if (!(error instanceof Error && / (is not on the pitch|cannot come on)$/.test(error.message))) throw error;
  }
}

function playLiveRound(session: EngineSession) {
  const round = session.apply({ type: "startRound" });
  session.apply({ type: "seeMinute", minute: SUBSTITUTION_MINUTE });
  if (round.humanSides) for (const side of round.humanSides) substitute(session, side, side.clubId);
  else if (round.coach) substitute(session, round.coach);
  session.apply({ type: "finishRound" });
}

/**
 * Plays a game day by day through the session's commands, the coach's match days live with a
 * substitution, and hashes the save after each day. The same script must give the same hashes in
 * Node and in every browser engine the app runs on.
 */
export async function dailyHashes({ seed, choices, days, hashFrom, dumpOn }: DailyHashScript): Promise<{ days: DayHash[]; dump: Record<string, string> | null }> {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed, choices });
  const isHotSeat = session.hotSeat() !== null;
  const hashes: DayHash[] = [];
  let dump: Record<string, string> | null = null;
  while (hashes.length < days) {
    clearDesk(session);
    if (isHotSeat && !session.hotSeat()?.isLastTurn) {
      session.apply({ type: "passTurn" });
      continue;
    }
    const today = session.read(["date", "coachClubId", "fixtures", "nations", "waitingCoaches"]);
    if (isHotSeat ? isHumanMatchDay(today) : isCoachMatchDay(today)) playLiveRound(session);
    else session.apply({ type: "advance", days: [{}] });
    const { date } = session.read(["date"]);
    if (hashFrom && date < hashFrom) continue;
    const shards = session.saveShards();
    if (date === dumpOn) dump = { ...shards };
    hashes.push({ date, shards: await hashShards(shards) });
  }
  return { days: hashes, dump };
}
