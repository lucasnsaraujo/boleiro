import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { passTheSeat } from "./humanCoaches.js";
import { coachesByClub } from "./aiCoaches.js";
import { applyForJob } from "./applyForJob.js";
import { clubStatures } from "./clubStatures.js";
import { OFFER_REACH } from "./coach.js";
import { jobCentre } from "./jobCentre.js";
import { RESIGN_COOLDOWN_SEASONS, RESIGN_REPUTATION_COST, resign } from "./resign.js";

function playDays(state: GameState, days: number): GameState {
  let next = state;
  for (let i = 0; i < days; i++) next = advanceDay(next, {}).state;
  return next;
}

describe("resigning", () => {
  const game = playDays(loadNewGame(7, { coachClubId: "bahia-ba" }), 20);
  const resigned = resign(game);

  it("leaves the coach without a club or contract, a little less wanted", () => {
    expect(resigned.coachClubId).toBeNull();
    expect(resigned.coach.contract).toBeNull();
    expect(resigned.coach.reputation).toBe(game.coach.reputation - RESIGN_REPUTATION_COST);
  });

  it("closes his spell as a resignation in his record", () => {
    expect(resigned.history.coach.stints.at(-1)).toMatchObject({ clubId: "bahia-ba", until: game.date, left: "resigned" });
    expect(resigned.history.coach.resignations).toEqual([{ clubId: "bahia-ba", date: game.date }]);
  });

  it("opens the job he left, which an AI coach takes two weeks later", () => {
    expect(resigned.coaches?.openJobs["bahia-ba"]).toBe(game.date);
    const later = playDays(resigned, 16);
    expect(coachesByClub(later.coaches ?? { coaches: {} }).get("bahia-ba")?.name).toBeTruthy();
  });

  it("keeps the old club from hiring him back for two seasons", () => {
    expect(resigned.coach.cooldowns).toEqual([{ clubId: "bahia-ba", untilSeason: game.season + RESIGN_COOLDOWN_SEASONS }]);
    expect(applyForJob(resigned, "bahia-ba").answer).toBe("notWelcome");
  });

  it("is refused to a coach without a club", () => {
    expect(() => resign(resigned)).toThrow();
  });

  it("is the seated coach's own in a hot-seat game", () => {
    const hotSeat = loadNewGame(7, { coachClubId: "bahia-ba", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "vitoria-ba" }] } });
    const bruno = resign(passTheSeat(hotSeat));
    expect(bruno.coachClubId).toBeNull();
    expect(bruno.waitingCoaches?.[0]?.clubId).toBe("bahia-ba");
  });
});

describe("the job centre", () => {
  const game = loadNewGame(7, { coachClubId: "bahia-ba" });
  const statures = clubStatures(game);
  const bySize = [...statures].filter(([id]) => id in game.boards && id !== "bahia-ba").sort(([, a], [, b]) => a - b);
  const small = bySize[0]?.[0] ?? "";
  const big = bySize.at(-1)?.[0] ?? "";
  const open = (state: GameState, ...clubIds: string[]): GameState => ({
    ...state,
    coaches: state.coaches && { ...state.coaches, openJobs: Object.fromEntries(clubIds.map((id) => [id, state.date])) },
  });
  const unemployed = { ...resign(open(game, small, big)), coach: { ...game.coach, contract: null, reputation: (statures.get(small) ?? 0) + 1 } };

  it("lists the clubs with an open job and whether each would take the coach", () => {
    const jobs = jobCentre(unemployed);
    const row = (clubId: string) => jobs.find((job) => job.clubId === clubId);
    expect(row(small)).toMatchObject({ openedOn: game.date, wouldHire: true });
    expect(row(big)).toMatchObject({ openedOn: game.date, wouldHire: false });
  });

  it("lists, after the open jobs, the clubs whose board is about to fire its coach", () => {
    const shaky = Object.keys(game.boards).find((id) => id !== "bahia-ba" && id !== small && id !== big) ?? "";
    const board = game.boards[shaky];
    const pressed = board ? { ...unemployed, boards: { ...unemployed.boards, [shaky]: { ...board, games: 10, pressure: 0.9 } } } : unemployed;
    const jobs = jobCentre(pressed);
    expect(jobs.at(-1)).toMatchObject({ clubId: shaky, openedOn: null, coachName: coachesByClub(game.coaches ?? { coaches: {} }).get(shaky)?.name });
    expect(jobCentre(unemployed).some((job) => job.clubId === shaky)).toBe(false);
  });

  it("gives the coach an offer from an open job his reputation reaches", () => {
    const applied = applyForJob(unemployed, small);
    expect(applied.answer).toBe("offered");
    expect(applied.state.coach.offers.map((offer) => offer.clubId)).toContain(small);
    expect(applied.state.coach.offers.find((offer) => offer.clubId === small)?.expiresOn).toBe(addDays(game.date, 14));
  });

  it("turns down a coach whose reputation falls short of the club", () => {
    const applied = applyForJob(unemployed, big);
    expect((statures.get(big) ?? 0) - unemployed.coach.reputation).toBeGreaterThan(OFFER_REACH);
    expect(applied.answer).toBe("tooBig");
    expect(applied.state).toBe(unemployed);
  });

  it("answers a club with a coach in charge that it has no opening", () => {
    const withCoach = Object.keys(game.boards).find((id) => id !== "bahia-ba" && id !== small && id !== big) ?? "";
    expect(applyForJob(unemployed, withCoach).answer).toBe("noOpening");
  });

  it("hires the applicant once he signs the offer", () => {
    const applied = applyForJob(unemployed, small).state;
    const signed = advanceDay(applied, { acceptOffer: small }).state;
    expect(signed.coachClubId).toBe(small);
    expect(signed.coaches?.openJobs[small]).toBeUndefined();
  });
});
