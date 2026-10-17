import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { applyForJob } from "../coach/applyForJob.js";
import { jobCentre } from "../coach/jobCentre.js";
import { offerJobs } from "../coach/offerJobs.js";
import type { CoachStint } from "../history/history.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import type { CoachRequest } from "../transfers/coachRequest.js";

let windowDay = loadNewGame(4, { coachClubId: "flamengo-rj" });
while (windowDay.date < "2026-01-05") windowDay = advanceDay(windowDay, {}).state;

/** The coach with one spell at a club, running it still when `until` is null. */
function withSpell(state: GameState, clubId: string, from: string, until: string | null): GameState {
  const stint: CoachStint = { clubId, from, until, left: until ? "contractEnded" : null };
  return {
    ...state,
    coachClubId: until ? null : clubId,
    coach: { ...state.coach, reputation: 100, offers: [] },
    history: { ...state.history, coach: { ...state.history.coach, stints: [stint] } },
  };
}

const withOpenJobs = (state: GameState, clubIds: string[]): GameState => {
  if (!state.coaches) throw new Error("no AI coaches");
  return { ...state, coaches: { ...state.coaches, openJobs: Object.fromEntries(clubIds.map((id) => [id, state.date])) } };
};

const sixYearsAtFlamengo = withSpell(windowDay, "flamengo-rj", "2020-01-05", "2026-01-04");
const oneYearAtFlamengo = withSpell(windowDay, "flamengo-rj", "2025-01-05", "2026-01-04");

describe("a long-serving coach and his old club's rivals", () => {
  it("hears no offer from Fluminense after six years at Flamengo, but still from clubs with no derby against it", () => {
    const offered = offerJobs(sixYearsAtFlamengo, ["fluminense-rj", "bahia-ba"], () => 0.5).state.coach.offers.map((o) => o.clubId);
    expect(offered).toEqual(["bahia-ba"]);
  });

  it("hears from Fluminense after a single year at Flamengo", () => {
    const offered = offerJobs(oneYearAtFlamengo, ["fluminense-rj"], () => 0.5).state.coach.offers.map((o) => o.clubId);
    expect(offered).toEqual(["fluminense-rj"]);
  });

  it("is turned down when he applies to the rival, and the job centre says why", () => {
    const open = withOpenJobs(sixYearsAtFlamengo, ["fluminense-rj", "bahia-ba"]);
    expect(applyForJob(open, "fluminense-rj").answer).toBe("rivalIdol");
    expect(applyForJob(open, "bahia-ba").answer).toBe("offered");
    const jobs = jobCentre(open);
    expect(jobs.find((job) => job.clubId === "fluminense-rj")).toMatchObject({ wouldHire: false, refusal: "rivalIdol", idolOf: "flamengo-rj" });
    expect(jobs.find((job) => job.clubId === "bahia-ba")).toMatchObject({ wouldHire: true, refusal: null, idolOf: null });
  });
});

const rich = (state: GameState): GameState => {
  const coachClubId = state.coachClubId ?? "";
  const finance = state.finances[coachClubId];
  if (!finance) throw new Error("no finances");
  return { ...state, finances: { ...state.finances, [coachClubId]: { ...finance, transferBudget: 1e10, wageCap: 1e10 } } };
};
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const standout = (state: GameState, clubId: string): SimPlayer => {
  const best = squadOf(state, clubId).sort((a, b) => b.strength - a.strength)[0];
  if (!best) throw new Error(`no player at ${clubId}`);
  return best;
};
const reasonOf = (state: GameState, request: CoachRequest) => {
  const day = advanceDay(state, { requests: [request] });
  const decided = day.events.find((e): e is Extract<DayEvent, { type: "requestDecided" }> => e.type === "requestDecided");
  return decided?.reason ?? null;
};

describe("the market between rivals", () => {
  const stillAtFlamengo = rich(withSpell(windowDay, "flamengo-rj", "2020-01-05", null));

  it("Fluminense won't sell to Flamengo's long-serving coach; Bahia has no such grudge", () => {
    const flu = standout(stillAtFlamengo, "fluminense-rj");
    expect(reasonOf(stillAtFlamengo, { kind: "sign", playerId: flu.id, fee: 1e9 })).toBe("rivalWillNotSell");
    const bahia = standout(stillAtFlamengo, "bahia-ba");
    expect(reasonOf(stillAtFlamengo, { kind: "sign", playerId: bahia.id, fee: 1e9 })).not.toBe("rivalWillNotSell");
  });

  it("a Fluminense idol refuses to move to Flamengo, even with his release clause paid", () => {
    const newcomer = rich(withSpell(windowDay, "flamengo-rj", "2025-12-01", null));
    const idol = standout(newcomer, "fluminense-rj");
    const history = { ...newcomer.history, players: { ...newcomer.history.players, "fluminense-rj": { [idol.id]: { name: idol.name, apps: 220, goals: 10 } } } };
    const remembered = { ...newcomer, history };
    expect(reasonOf(remembered, { kind: "sign", playerId: idol.id, fee: 1e9 })).toBe("idolRefusesRival");
    expect(reasonOf(remembered, { kind: "payClause", playerId: idol.id })).toBe("idolRefusesRival");
    expect(reasonOf(newcomer, { kind: "sign", playerId: idol.id, fee: 1e9 })).not.toBe("idolRefusesRival");
  });
});
