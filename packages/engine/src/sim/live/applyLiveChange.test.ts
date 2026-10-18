import { describe, expect, it } from "vitest";
import type { MatchPlan } from "../coach/matchPlan.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { incidentHandling, isLockedToPlans } from "./incidentHandling.js";
import type { LiveDay } from "./liveDay.js";
import { startMatchDay } from "./startMatchDay.js";

const withPlan = (state: GameState, matchPlan: MatchPlan): GameState => ({ ...state, coach: { ...state.coach, matchPlan } });
const coachEvents = (live: LiveDay) => live.matches.find((m) => m.fixtureId === live.coachMatch?.fixtureId)?.events ?? [];
/** Today's matches cut to the coach's own, so a day kicks off fast. */
const onlyCoachMatch = (state: GameState): GameState => ({
  ...state,
  fixtures: state.fixtures.filter((f) => f.date !== state.date || f.homeId === state.coachClubId || f.awayId === state.coachClubId),
});

// Barcelona de Rondônia opens the 2026 Copa do Brasil at home on 18 February, a one-match tie settled on penalties.
const CUP_TIE_DAY = "2026-02-18";
const cupTie = onlyCoachMatch({ ...loadNewGame(5, { coachClubId: "barcelona-ro" }), date: CUP_TIE_DAY });
const leagueDay = (() => {
  const game = loadNewGame(5, { coachClubId: "flamengo-rj" });
  const date = game.fixtures.find((f) => f.homeId === "flamengo-rj" || f.awayId === "flamengo-rj")?.date ?? "";
  return onlyCoachMatch({ ...game, date });
})();

describe("the saved tactics of a coach's match plan", () => {
  const saved: MatchPlan = { savedTactics: [{ formation: "3-5-2", posture: "attacking", penaltyTakerId: null, marking: "light", play: "flanks" }] };

  it("put their formation, posture, marking and play on his side at the minute he picks them", () => {
    const changed = applyLiveChange(startMatchDay(withPlan(leagueDay, saved), {}), 30, { savedTactics: 0 });
    expect(changed.coachMatch?.tactics).toMatchObject({ formation: "3-5-2", posture: "attacking", marking: "light", play: "flanks" });
    expect(changed.coachMatch?.lastChangeMinute).toBe(30);
  });

  it("put on whole, so a saved tactics with a mixed play and the usual marking takes off the play and marking on the pitch", () => {
    const mixed: MatchPlan = { savedTactics: [{ formation: "4-4-2", posture: "balanced", penaltyTakerId: null }] };
    const kickOff = { tactics: { formation: "4-3-3" as const, posture: "attacking" as const, penaltyTakerId: null, marking: "veryHeavy" as const, play: "flanks" as const } };
    const changed = applyLiveChange(startMatchDay(withPlan(leagueDay, mixed), kickOff), 30, { savedTactics: 0 });
    expect(changed.coachMatch?.tactics).toEqual({ formation: "4-4-2", posture: "balanced", penaltyTakerId: null });
  });

  it("can't be picked when the plan keeps none in that place", () => {
    expect(() => applyLiveChange(startMatchDay(withPlan(leagueDay, saved), {}), 30, { savedTactics: 1 })).toThrow(/no saved tactics 2/);
  });
});

describe("the house rule 'manual changes only in finals'", () => {
  const ruled = { ...leagueDay, manualChangesOnlyInFinals: true as const };
  const fixture = ruled.fixtures.find((f) => f.date === ruled.date) ?? ruled.fixtures[0];
  const copa = Object.values(ruled.competitions).find((c) => c.kind === "cup");
  const final = { competitionId: copa?.id ?? "", stage: (copa?.stageDates.length ?? 1) - 1 };

  it("leaves a league match to the plans, and a cup's final to the coaches", () => {
    expect(fixture && isLockedToPlans(ruled, fixture)).toBe(true);
    expect(isLockedToPlans(ruled, final)).toBe(false);
    expect(isLockedToPlans(leagueDay, { ...final, stage: 0 })).toBe(false);
  });

  it("stops asking the coach about his red cards and injuries outside a final", () => {
    expect(fixture && incidentHandling(ruled, "flamengo-rj", fixture)).toBe("matchPlan");
    expect(incidentHandling(ruled, "flamengo-rj", final)).toBe("askCoach");
    expect(fixture && incidentHandling(leagueDay, "flamengo-rj", fixture)).toBe("askCoach");
  });

  it("refuses a coach's substitution or new dials outside a final, but takes his saved tactics and his talk", () => {
    const live = startMatchDay(withPlan(ruled, { savedTactics: [{ formation: "4-3-3", posture: "defensive", penaltyTakerId: null }] }), {});
    const offId = live.coachMatch?.starters.home.concat(live.coachMatch.starters.away).find((p) => p.clubId === "flamengo-rj" && p.group === "MID")?.id ?? "";
    const onId = live.coachMatch?.bench.find((p) => p.group === "MID")?.id ?? "";
    expect(() => applyLiveChange(live, 20, { substitutions: [{ offId, onId }] })).toThrow(/only in finals/);
    expect(() => applyLiveChange(live, 20, { posture: "attacking" })).toThrow(/only in finals/);
    expect(applyLiveChange(live, 20, { savedTactics: 0 }).coachMatch?.tactics.formation).toBe("4-3-3");
    expect(applyLiveChange(live, 45, { talk: "calm" }).coachMatch?.halfTimeTalks?.["flamengo-rj"]?.tone).toBe("calm");
    expect(applyLiveChange(startMatchDay(leagueDay, {}), 20, { substitutions: [{ offId, onId }] }).coachMatch?.lastChangeMinute).toBe(20);
  });
});

describe("a shootout order asked for when the coach's match ends level", () => {
  const level = (() => {
    for (let seed = 0; seed < 300; seed++) {
      const live = startMatchDay({ ...cupTie, rngState: seed }, {});
      const isOverruled = coachEvents(live).some((e) => e.type === "orderOverruled");
      if (coachEvents(live).some((e) => e.type === "shootoutKick") && !isOverruled) return live;
    }
    throw new Error("no level cup tie");
  })();
  const kicks = (live: LiveDay) => coachEvents(live).flatMap((e) => (e.type === "shootoutKick" && e.clubId === "barcelona-ro" ? [e.playerId] : []));

  it("kicks the shootout again in the coach's order, leaving the ninety minutes as they were", () => {
    const before = kicks(level);
    const order = [...before.slice(0, 5)].reverse();
    const changed = applyLiveChange(level, 90, { kickerOrder: order });
    const kicked = kicks(changed);
    expect(kicked.length).toBeGreaterThanOrEqual(3);
    expect(kicked.slice(0, Math.min(5, kicked.length))).toEqual(order.slice(0, Math.min(5, kicked.length)));
    const ninety = (live: LiveDay) => coachEvents(live).filter((e) => e.type !== "shootoutKick" && e.type !== "orderOverruled");
    expect(ninety(changed)).toEqual(ninety(level));
  });

  it("can't come before the match ends, nor twice", () => {
    expect(() => applyLiveChange(level, 60, { kickerOrder: kicks(level) })).toThrow(/ends level/);
    const once = applyLiveChange(level, 90, { kickerOrder: kicks(level) });
    expect(() => applyLiveChange(once, 90, { kickerOrder: kicks(level) })).toThrow(/once/);
  });

  it("is refused in a match the house rule leaves to the plans", () => {
    const ruled = startMatchDay({ ...cupTie, rngState: level.state.rngState, manualChangesOnlyInFinals: true }, {});
    expect(() => applyLiveChange(ruled, 90, { kickerOrder: kicks(level) })).toThrow(/only in finals/);
  });

  it("is the plan's order from kick-off when the plan sets one", () => {
    const order = [...kicks(level).slice(0, 5)].reverse();
    const planned = startMatchDay(withPlan({ ...cupTie, rngState: level.state.rngState }, { kickerOrder: order }), {});
    const kicked = kicks(planned);
    expect(kicked.length).toBeGreaterThanOrEqual(3);
    expect(kicked.slice(0, 5)).toEqual(order.slice(0, Math.min(5, kicked.length)));
  });
});
