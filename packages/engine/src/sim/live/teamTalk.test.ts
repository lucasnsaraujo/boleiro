import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { clubMood } from "../morale/clubMood.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { finishMatchDay } from "./finishMatchDay.js";
import { formStrength } from "./formOfTheDay.js";
import { HALF_TIME } from "./matchTimeline.js";
import { startMatchDay } from "./startMatchDay.js";
import { assistantTalk, talkEffect } from "./teamTalk.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH_CLUB });
let matchDay: GameState = start;
const firstMatch = start.fixtures.find((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB)?.date ?? "";
while (matchDay.date < firstMatch) matchDay = advanceDay(matchDay, {}).state;

describe("a team talk", () => {
  it("lifts a side that trails when the coach demands more, and unsettles one that leads", () => {
    const behind = talkEffect("demand", { lead: -1, morale: 60, isDerby: false });
    const ahead = talkEffect("demand", { lead: 1, morale: 60, isDerby: false });
    expect(behind.form).toBeGreaterThan(0);
    expect(ahead.form).toBeLessThan(0);
    expect(ahead.morale).toBeLessThan(0);
    expect(talkEffect("demand", { lead: -1, morale: 20, isDerby: false }).form).toBeLessThan(0);
    expect(talkEffect("praise", { lead: 2, morale: 60, isDerby: false }).form).toBeGreaterThan(talkEffect("praise", { lead: -1, morale: 60, isDerby: false }).form);
  });

  it("moves a day's form by less than a tenth of the gap between an awful day and an inspired one", () => {
    for (const lead of [-3, -1, 0, 1, 3]) {
      for (const morale of [10, 50, 90]) {
        for (const tone of ["calm", "faith", "demand", "praise"] as const) {
          const { form, morale: moved } = talkEffect(tone, { lead, morale, isDerby: lead === 0 });
          expect(Math.abs(form)).toBeLessThanOrEqual(0.2);
          expect(Math.abs(moved)).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("has the assistant pick the tone that suits the moment", () => {
    expect(assistantTalk({ lead: -1, morale: 60, isDerby: false })).toBe("demand");
    expect(assistantTalk({ lead: 2, morale: 60, isDerby: false })).toBe("praise");
    expect(assistantTalk({ lead: 0, morale: 60, isDerby: true })).toBe("calm");
    expect(assistantTalk({ lead: 0, morale: 30, isDerby: false })).toBe("faith");
  });

  it("before kick-off shifts the form of the coach's players for the day, and nobody else's", () => {
    const quiet = startMatchDay(matchDay, {});
    const talked = startMatchDay(matchDay, { talk: "faith" });
    const open = quiet.coachMatch;
    const lifted = talked.coachMatch;
    if (!open || !lifted) throw new Error("the coach has a match today");
    const shift = formStrength(talkEffect("faith", { lead: 0, morale: clubMood(matchDay, COACH_CLUB).squad, isDerby: false }).form);
    const ownIds = Object.keys(open.strengths).filter((id) => matchDay.players[id]?.clubId === COACH_CLUB);
    expect(ownIds.length).toBeGreaterThan(11);
    const gains = ownIds.map((id) => (lifted.strengths[id] ?? 0) - (open.strengths[id] ?? 0));
    // A player already at his best possible day keeps it: form never goes past an inspired day.
    for (const gain of gains) {
      expect(gain).toBeGreaterThanOrEqual(-1e-9);
      expect(gain).toBeLessThanOrEqual(shift + 1e-9);
    }
    expect(gains.filter((gain) => Math.abs(gain - shift) < 1e-9).length).toBeGreaterThan(ownIds.length / 2);
    for (const id of Object.keys(open.strengths).filter((own) => !ownIds.includes(own))) expect(lifted.strengths[id]).toBe(open.strengths[id]);
    const others = (live: typeof quiet) => live.matches.filter((m) => m.fixtureId !== open.fixtureId);
    expect(others(talked)).toEqual(others(quiet));
  });

  it("at half-time lifts the coach's side for the second half and leaves the first half as it was", () => {
    const live = startMatchDay(matchDay, {});
    const open = live.coachMatch;
    if (!open) throw new Error("the coach has a match today");
    const talked = applyLiveChange(live, HALF_TIME, { talk: "faith" });
    const lifted = talked.coachMatch;
    const ownIds = Object.keys(open.strengths).filter((id) => matchDay.players[id]?.clubId === COACH_CLUB);
    expect(ownIds.every((id) => (lifted?.strengths[id] ?? 0) > (open.strengths[id] ?? 0))).toBe(true);
    const firstHalf = (day: typeof live) => day.matches.find((m) => m.fixtureId === open.fixtureId)?.events.filter((e) => e.minute <= HALF_TIME && e.type !== "halfTime");
    expect(firstHalf(talked)).toEqual(firstHalf(live));
    expect(() => applyLiveChange(talked, HALF_TIME, { talk: "calm" })).toThrow();
    expect(() => applyLiveChange(live, 30, { talk: "calm" })).toThrow();
  });

  it("leaves the squad's morale moved after the final whistle", () => {
    const praised = startMatchDay(matchDay, { talk: "praise" });
    const moved = talkEffect("praise", { lead: 0, morale: clubMood(matchDay, COACH_CLUB).squad, isDerby: false }).morale;
    const after = finishMatchDay(praised).state;
    const withoutWords = finishMatchDay({ ...praised, decisions: { ...praised.decisions, talk: undefined } }).state;
    expect(moved).toBeGreaterThan(0);
    expect(clubMood(after, COACH_CLUB).squad).toBe(Math.min(100, clubMood(withoutWords, COACH_CLUB).squad + moved));
  });
});
