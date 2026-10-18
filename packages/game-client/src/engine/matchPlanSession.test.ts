import { describe, expect, it } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession, type NewGameChoices } from "./createEngineSession.js";

const ANA = { name: "Ana", clubId: "flamengo-rj" };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };
const twoCoaches = { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] } };

function newSession(choices: NewGameChoices) {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices });
  return session;
}

describe("the match plan through the session", () => {
  it("is kept by each hot-seat coach, and a key one coach took is refused to the other", () => {
    const session = newSession(twoCoaches);
    session.apply({ type: "setMatchPlan", plan: { keepsShape: true, tacticsKey: "q", timeOutKey: "w" } });
    session.apply({ type: "passTurn" });
    expect(session.matchPlan()).toEqual({ plan: {}, keysTaken: [{ key: "q", coachName: "Ana" }, { key: "w", coachName: "Ana" }], isFinalsOnly: false });
    expect(() => session.apply({ type: "setMatchPlan", plan: { timeOutKey: "w" } })).toThrow(/Ana's/);
    session.apply({ type: "setMatchPlan", plan: { timeOutKey: "p" } });
    expect(session.matchPlan().plan).toEqual({ timeOutKey: "p" });
  });

  it("can't change while a match day is under way", () => {
    const session = newSession({ coachClubId: ANA.clubId });
    session.apply({ type: "playToMatchDay" });
    session.apply({ type: "startRound" });
    expect(() => session.apply({ type: "setMatchPlan", plan: { keepsShape: true } })).toThrow(/under way/);
  });

  it("goes with the save, and a save from before plans opens with an empty one", () => {
    const session = newSession({ coachClubId: ANA.clubId, manualChangesOnlyInFinals: true });
    const planned = { keepsShape: true as const, energyFloor: 55, asksBeforeShootout: true as const };
    session.apply({ type: "setMatchPlan", plan: planned });
    const save = session.save();
    const loaded = createEngineSession(bundledGameFiles);
    loaded.apply({ type: "load", save });
    expect(loaded.matchPlan()).toEqual({ plan: planned, keysTaken: [], isFinalsOnly: true });

    const before = JSON.parse(save);
    delete before.game.coach.matchPlan;
    delete before.game.manualChangesOnlyInFinals;
    const old = createEngineSession(bundledGameFiles);
    old.apply({ type: "load", save: JSON.stringify(before) });
    expect(old.matchPlan()).toEqual({ plan: {}, keysTaken: [], isFinalsOnly: false });
  });

  it("shows the live round each human coach's keys, saved tactics and whether he is asked his shootout order", () => {
    const session = newSession(twoCoaches);
    const saved = { formation: "4-3-3" as const, posture: "attacking" as const, penaltyTakerId: null };
    session.apply({ type: "setMatchPlan", plan: { keepsShape: true, tacticsKey: "q", savedTactics: [saved] } });
    session.apply({ type: "passTurn" });
    session.apply({ type: "setMatchPlan", plan: { timeOutKey: "p", asksBeforeShootout: true } });
    for (let step = 0; step < 40 && !session.hotSeat()?.coaches.some((coach) => coach.playsToday); step++) {
      while (!session.hotSeat()?.isLastTurn) session.apply({ type: "passTurn" });
      session.apply({ type: "playToMatchDay" });
    }
    while (!session.hotSeat()?.isLastTurn) session.apply({ type: "passTurn" });
    const round = session.apply({ type: "startRound" });
    const expected: Record<string, unknown> = {
      [ANA.clubId]: { tacticsKey: "q", savedTactics: [saved], asksBeforeShootout: false },
      [BRUNO.clubId]: { timeOutKey: "p", savedTactics: [], asksBeforeShootout: true },
    };
    // With one of them playing today, his is the round's only coach side.
    const sides = round.humanSides ?? (round.coach && round.coachClubId ? [{ ...round.coach, clubId: round.coachClubId }] : []);
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      expect(side.plan).toEqual(expected[side.clubId]);
      expect(side.incidentHandling).toBe("askCoach");
    }
  });
});
