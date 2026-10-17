import { TALK_TONES } from "@boleiro/engine/sim/live/teamTalk";
import { HALF_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import { expect, test } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const CLUB = "flamengo-rj";
const RIVAL_COACH = { name: "Bruno", clubId: "palmeiras-sp" };
const SEED = 7;
const MAX_STEPS = 40;
const twoCoaches = { coachClubId: CLUB, hotSeat: { coachName: "Ana", otherCoaches: [RIVAL_COACH] } };

/** A session stopped on the first coach's first match day, before kick-off, with him in the seat. */
function atMatchDay(choices: { coachClubId: string; hotSeat?: typeof twoCoaches.hotSeat } = { coachClubId: CLUB }) {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices });
  for (let step = 0; step < MAX_STEPS; step++) {
    const view = session.hotSeat();
    if (view && !view.isLastTurn) session.apply({ type: "passTurn" });
    else if (session.apply({ type: "playToMatchDay" }).stop === "matchDay" && session.read(["coachClubId"]).coachClubId === CLUB) return session;
  }
  throw new Error("the coach reaches a match day");
}

const ownStrengths = (round: ReturnType<ReturnType<typeof createEngineSession>["liveRound"]>) => (round?.coach?.squad ?? []).map((player) => player.strength);

test("the match-day plan carries the assistant's tone for the talk, and the coach's talk goes with the kick-off", () => {
  const quiet = atMatchDay();
  const talked = atMatchDay();
  const plan = talked.matchDayPlan();
  expect(TALK_TONES).toContain(plan.talk.suggested);
  const before = quiet.apply({ type: "startRound" });
  const after = talked.apply({ type: "startRound", talk: plan.talk.suggested });
  expect(ownStrengths(after)).not.toEqual(ownStrengths(before));
  expect(after.coach?.halfTimeTalk.given).toBeNull();
});

test("a half-time talk lands once, shows in the round with what it did, and the final whistle keeps it", () => {
  const session = atMatchDay();
  const round = session.apply({ type: "startRound" });
  expect(TALK_TONES).toContain(round.coach?.halfTimeTalk.suggested);
  session.apply({ type: "seeMinute", minute: HALF_TIME });
  const talked = session.apply({ type: "changeLive", minute: HALF_TIME, change: { talk: "calm" } });
  expect(talked.coach?.halfTimeTalk.given?.tone).toBe("calm");
  expect(() => session.apply({ type: "changeLive", minute: HALF_TIME, change: { talk: "demand" } })).toThrow();
  expect(session.apply({ type: "finishRound" }).events.some((e) => e.type === "matchPlayed")).toBe(true);
});

test("in a hot-seat game a coach's talk on his turn lifts his own side and nobody else's", () => {
  const strengthsOf = (session: ReturnType<typeof atMatchDay>, clubId: string) => session.liveRound()?.humanSides?.find((side) => side.clubId === clubId)?.squad.map((p) => p.strength);
  const quiet = atMatchDay(twoCoaches);
  const talked = atMatchDay(twoCoaches);
  quiet.apply({ type: "passTurn" });
  talked.apply({ type: "passTurn", talk: "faith" });
  quiet.apply({ type: "startRound" });
  talked.apply({ type: "startRound" });
  expect(strengthsOf(talked, CLUB)).toBeDefined();
  expect(strengthsOf(talked, CLUB)).not.toEqual(strengthsOf(quiet, CLUB));
  expect(strengthsOf(talked, RIVAL_COACH.clubId)).toEqual(strengthsOf(quiet, RIVAL_COACH.clubId));
});
