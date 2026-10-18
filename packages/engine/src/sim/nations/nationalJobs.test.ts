import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { beforeAll, describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer, declineNationalOffer, nationalJobsAfter, poolOf, reputationFor, setCallUp } from "./nationalJobs.js";

const start = loadNewGame(5, { coachClubId: "flamengo-rj", nationalFootball: loadNationalFootball() });

function playTo(state: GameState, date: string, events: DayEvent[] = []): GameState {
  let game = state;
  while (game.date < date) {
    const day = advanceDay(game, {});
    events.push(...day.events);
    game = day.state;
  }
  return game;
}

describe("national-team jobs", () => {
  const events: DayEvent[] = [];
  let afterWorldCup: GameState;
  beforeAll(() => {
    afterWorldCup = playTo(start, "2026-07-21", events);
  }, 120_000);

  it("are offered after the World Cup by a federation whose team went out early, when the coach's reputation reaches it", () => {
    const offered = events.find((e) => e.type === "nationalJobOffered");
    expect(offered).toBeDefined();
    const teamId = offered?.type === "nationalJobOffered" ? offered.teamId : "";
    const nations = afterWorldCup.nations;
    if (!nations) throw new Error("the game needs national football");
    expect(reputationFor(nations, teamId)).toBeLessThanOrEqual(afterWorldCup.coach.reputation);
    const rounds = afterWorldCup.nations?.matches.filter((m) => m.competitionId === "world-cup-2026" && (m.homeId === teamId || m.awayId === teamId)).map((m) => m.round);
    expect(rounds).not.toContain("quarter-finals");
    expect(afterWorldCup.nations?.offer?.teamId).toBe(teamId);
  });

  it("let the coach take the job with his club, or turn it down", () => {
    const taken = acceptNationalOffer(afterWorldCup);
    expect(taken.state.nations?.job).toEqual({ teamId: afterWorldCup.nations?.offer?.teamId, since: afterWorldCup.date });
    expect(taken.state.coachClubId).toBe(afterWorldCup.coachClubId);
    expect(taken.state.nations?.offer).toBeUndefined();
    expect(declineNationalOffer(afterWorldCup).nations?.offer).toBeUndefined();
    expect(() => declineNationalOffer(taken.state)).toThrow();
  });

  it("calls up the coach's own picks at the next window", () => {
    const { state } = acceptNationalOffer(afterWorldCup);
    const teamId = state.nations?.job?.teamId ?? "";
    const pool = poolOf(state, teamId);
    const keeper = pool.find((ref) => (ref.startsWith("~") ? state.nations?.outsiders[teamId]?.roles[Number(ref.slice(1))] === "g" : state.players[ref]?.group === "GK")) ?? "";
    const picks = [keeper, ...pool.filter((ref) => ref !== keeper).slice(-19)];
    const picked = setCallUp(state, picks);
    const september = playTo(picked, "2026-09-21");
    const callUp = september.nations?.callUps[teamId];
    const called = [...(callUp?.playerIds ?? []), ...(callUp?.outsiders.map((row) => `~${row}`) ?? [])];
    expect(called.filter((ref) => picks.includes(ref)).length).toBeGreaterThanOrEqual(picks.length - 3);
    expect(() => setCallUp(state, ["nobody"])).toThrow(/pool/);
  }, 60_000);

  it("are lost when the coach's team goes out of a final tournament early", () => {
    const worldCup = afterWorldCup.nations?.competitions["world-cup-2026"];
    const groupOut = Object.values(worldCup?.groups ?? {}).flat().find((id) => afterWorldCup.nations?.matches.filter((m) => m.competitionId === "world-cup-2026" && (m.homeId === id || m.awayId === id)).every((m) => m.round === "group"));
    expect(groupOut).toBeDefined();
    const coaching = { ...afterWorldCup, nations: afterWorldCup.nations && { ...afterWorldCup.nations, job: { teamId: groupOut ?? "", since: "2026-01-01" } } };
    const after = worldCup ? nationalJobsAfter(coaching, worldCup, "2026-07-19") : null;
    expect(after?.state.nations?.job).toBeUndefined();
    expect(after?.events).toContainEqual({ type: "nationalCoachFired", teamId: groupOut });
  });

  it("are neither lost nor offered when a Nations League ends, whatever the coach's team's group place", () => {
    const league = afterWorldCup.nations?.competitions["nations-league-2026"];
    const teamId = Object.values(league?.groups ?? {}).flat()[1] ?? "";
    const nations = afterWorldCup.nations && { ...afterWorldCup.nations, job: { teamId, since: "2026-01-01" } };
    if (nations) delete nations.offer;
    const coaching = { ...afterWorldCup, ...(nations ? { nations } : {}) };
    const after = league ? nationalJobsAfter(coaching, league, "2027-06-13") : null;
    expect(after?.state.nations?.job?.teamId).toBe(teamId);
    expect(after?.events).toEqual([]);
  });

  it("are not offered in a hot-seat game, whose coaches would share one national job", () => {
    const twoCoaches = loadNewGame(5, { coachClubId: "flamengo-rj", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "santos-sp" }] } });
    const worldCup = afterWorldCup.nations?.competitions["world-cup-2026"];
    const nations = afterWorldCup.nations && { ...afterWorldCup.nations };
    if (nations) delete nations.offer;
    const hotSeat = { ...afterWorldCup, ...(nations ? { nations } : {}), ...(twoCoaches.waitingCoaches ? { waitingCoaches: twoCoaches.waitingCoaches } : {}) };
    const after = worldCup ? nationalJobsAfter(hotSeat, worldCup, "2026-07-19") : null;
    expect(hotSeat.waitingCoaches).toHaveLength(1);
    expect(after?.events.filter((e) => e.type === "nationalJobOffered")).toEqual([]);
    expect(after?.state.nations?.offer).toBeUndefined();
  });
});
