import { describe, expect, it } from "vitest";
import { advanceDay, type DayDecisions, type DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { CAREER_START_REPUTATION, OFFER_REACH } from "./coach.js";
import { clubStatures } from "./clubStatures.js";

function playUntil(state: GameState, date: string, decide: (state: GameState) => DayDecisions = () => ({})): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, decide(current));
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const withSquadStrength = (state: GameState, clubId: string, strength: number): GameState => ({
  ...state,
  players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.clubId === clubId ? { ...p, strength } : p])),
});

const nationalClubs = (state: GameState) => Object.values(state.clubs).filter((club) => club.division !== null);
const byStature = (state: GameState, division: "A" | "B") => {
  const statures = clubStatures(state);
  return nationalClubs(state)
    .filter((club) => club.division === division)
    .sort((a, b) => (statures.get(b.id) ?? 0) - (statures.get(a.id) ?? 0));
};

describe("board expectations", () => {
  const start = loadNewGame(5, { coachClubId: "flamengo-rj" });

  it("asks a big Série A club for the title and the smallest to avoid relegation", () => {
    const serieA = byStature(start, "A");
    expect(start.boards["flamengo-rj"]?.expectation).toBe("title");
    expect(start.boards[serieA.at(-1)?.id ?? ""]?.expectation).toBe("avoidRelegation");
  });

  it("asks the biggest Série B club for promotion", () => {
    expect(start.boards[byStature(start, "B")[0]?.id ?? ""]?.expectation).toBe("promotion");
  });

  it("sets a target for every club in a national league and none for state-only clubs", () => {
    for (const club of Object.values(start.clubs)) expect(club.id in start.boards).toBe(club.division !== null);
  });
});

describe("firing", () => {
  const start = loadNewGame(7, { coachClubId: "flamengo-rj" });
  const leagueStart = start.calendar.leagueDates.A[0] ?? "";

  it("fires a coach whose team sits far below the board's target", () => {
    const { state, events } = playUntil(withSquadStrength(start, "flamengo-rj", 1), "2026-09-01");
    const fired = events.find((e) => e.type === "coachFired" && e.isYou);
    expect(fired).toBeDefined();
    expect(state.coachClubId).toBeNull();
    expect(state.coach.contract).toBeNull();
    expect(state.coach.reputation).toBeLessThan(start.coach.reputation);
  });

  it("keeps a coach whose team meets the board's target", () => {
    const { state, events } = playUntil(withSquadStrength(start, "flamengo-rj", 99), "2026-09-01");
    expect(events.some((e) => e.type === "coachFired" && e.isYou)).toBe(false);
    expect(state.coachClubId).toBe("flamengo-rj");
    expect(state.date > leagueStart).toBe(true);
  });

  it("fires coaches at other clubs during the league too", () => {
    const { events } = playUntil(start, "2026-09-01");
    expect(events.filter((e) => e.type === "coachFired" && !e.isYou).length).toBeGreaterThan(5);
  });
});

describe("job offers", () => {
  const offersOver = (state: GameState, days: number) => {
    const end = new Date(Date.parse(state.date) + days * 86_400_000).toISOString().slice(0, 10);
    return playUntil(state, end).events.flatMap((e) => (e.type === "jobOffered" ? [e.offer] : []));
  };
  const unemployed = (reputation: number) => {
    const state = loadNewGame(13, { coachClubId: null });
    return { ...state, coach: { ...state.coach, reputation } };
  };

  it("come from bigger clubs for a coach with a bigger reputation", () => {
    const statures = clubStatures(unemployed(0));
    const best = (reputation: number) => Math.max(0, ...offersOver(unemployed(reputation), 150).map((o) => statures.get(o.clubId) ?? 0));
    expect(best(90)).toBeGreaterThan(best(10));
  });

  it("only come from small clubs in career mode", () => {
    const career = loadNewGame(13, { coachClubId: null, careerMode: true });
    expect(career.coach.reputation).toBe(CAREER_START_REPUTATION);
    expect(career.coach.offers.length).toBeGreaterThan(0);
    const statures = clubStatures(career);
    const offers = [...career.coach.offers, ...offersOver(career, 150)];
    for (const offer of offers) expect(statures.get(offer.clubId)).toBeLessThanOrEqual(CAREER_START_REPUTATION + OFFER_REACH);
    expect(offers.every((o) => career.clubs[o.clubId]?.division !== "A")).toBe(true);
  });
});

describe("accepting an offer", () => {
  const career = loadNewGame(17, { coachClubId: null, careerMode: true });
  const offer = career.coach.offers[0];
  if (!offer) throw new Error("career mode starts without offers");
  const hired = advanceDay(career, { acceptOffer: offer.clubId });

  it("moves the coach to the club with the offered contract", () => {
    expect(hired.state.coachClubId).toBe(offer.clubId);
    expect(hired.state.coach.contract).toEqual({ salary: offer.salary, untilSeason: offer.untilSeason });
    expect(hired.state.coach.offers).toEqual([]);
    expect(hired.events).toContainEqual(expect.objectContaining({ type: "coachHired", clubId: offer.clubId }));
  });

  it("pays the coach's salary from the club's wages each month", () => {
    const { state } = playUntil(hired.state, "2026-02-02");
    expect(state.finances[offer.clubId]?.month.costs.wages).toBe(offer.salary);
  });

  it("refuses a club that made no offer", () => {
    expect(() => advanceDay(career, { acceptOffer: "flamengo-rj" })).toThrow();
  });
});

describe("a career save", () => {
  it("round-trips the coach and the boards", () => {
    const career = loadNewGame(19, { coachClubId: null, careerMode: true });
    const offer = career.coach.offers[0];
    const { state } = playUntil(career, "2026-05-10", (s) => (s.date === career.date && offer ? { acceptOffer: offer.clubId } : {}));
    const loaded = loadGame(saveGame(state));
    expect(loaded).toStrictEqual(state);
    expect(loaded.coach.careerMode).toBe(true);
  });

  it("rejects a save without a coach", () => {
    const save: Record<string, unknown> = JSON.parse(saveGame(loadNewGame(19, { coachClubId: null })));
    delete save.coach;
    expect(() => loadGame(JSON.stringify(save))).toThrow();
  });
});
