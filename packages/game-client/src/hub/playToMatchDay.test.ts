import { describe, expect, test } from "vitest";
import { addDays, daysBetween } from "@boleiro/engine/sim/dates";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import type { DayEvent } from "./inboxLines.js";
import { playToMatchDay, stopReason } from "./playToMatchDay.js";

const game = newGameFromFiles(5, { coachClubId: "bahia-ba" }, bundledGameFiles);
const firstMatch = game.fixtures
  .filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba")
  .map((f) => f.date)
  .sort()[0];
if (!firstMatch) throw new Error("Bahia has no fixture");

const WINDOW_WARNING = "Último dia para pedir reforços: a janela fecha amanhã";
const on = (date: string, state: GameState = game): GameState => ({ ...state, date });
const quietDay = (state: GameState) => ({ state: on(addDays(state.date, 1), state), events: [] });

describe("stopReason", () => {
  const quiet = on("2026-01-05");
  const stop = (events: DayEvent[], after = quiet) => stopReason(game, after, events);

  test("a quiet day goes on", () => {
    expect(stop([])).toBeNull();
  });

  test("the coach's match day stops the days", () => {
    expect(stop([], on(firstMatch))).toBe("matchDay");
  });

  test("a job offer stops so the coach can answer it", () => {
    expect(stop([{ type: "jobOffered", offer: { clubId: "vitoria-ba", salary: 1, untilSeason: 2026, expiresOn: "2026-01-20" } }])).toBe("jobOffer");
  });

  test("the coach's own firing stops; another coach's does not", () => {
    const fired = { type: "coachFired", clubId: "bahia-ba", date: quiet.date, position: 18, targetPosition: 10 } as const;
    expect(stop([{ ...fired, isYou: true }])).toBe("fired");
    expect(stop([{ ...fired, clubId: "vitoria-ba", isYou: false }])).toBeNull();
  });

  test("the board's answer to a request, or a sale it forced, stops", () => {
    expect(stop([{ type: "requestDecided", request: { kind: "sell", playerId: "p1" }, approved: false, reason: "noBuyer" }])).toBe("boardDecision");
    expect(stop([{ type: "forcedSale", clubId: "bahia-ba", playerId: "p1", buyerId: null, fee: 1 }])).toBe("boardDecision");
    expect(stop([{ type: "forcedSale", clubId: "vitoria-ba", playerId: "p1", buyerId: null, fee: 1 }])).toBeNull();
  });

  test("the last day a request still reaches the board inside the window stops", () => {
    expect(stop([], on("2026-03-02"))).toBe("windowClosing");
    expect(stop([], on("2026-03-01"))).toBeNull();
    expect(stop([], on("2026-09-10"))).toBe("windowClosing");
    expect(stop([], { ...on("2026-03-02"), coachClubId: null })).toBeNull();
  });

  test("the end of the season stops", () => {
    expect(stop([{ type: "seasonEnded", season: 2026, outcomes: {} }])).toBe("seasonEnd");
  });
});

describe("playToMatchDay", () => {
  test("plays quiet days until the coach's next match day", () => {
    const played = playToMatchDay(game, quietDay);
    expect(played.state.date).toBe(firstMatch);
    expect(played.stop).toBe("matchDay");
  });

  test("on a match day it plays nothing", () => {
    const today = on(firstMatch);
    const played = playToMatchDay(today, quietDay);
    expect(played.state).toBe(today);
    expect(played.stop).toBe("matchDay");
  });

  test("a day that needs the coach stops it early, after that day", () => {
    const offerDay = (state: GameState) => ({
      state: on(addDays(state.date, 1), state),
      events: [{ type: "jobOffered", offer: { clubId: "vitoria-ba", salary: 1, untilSeason: 2026, expiresOn: "2026-01-20" } } as const],
    });
    const played = playToMatchDay(game, offerDay);
    expect(played.state.date).toBe(addDays(game.date, 1));
    expect(played.stop).toBe("jobOffer");
    expect(played.news.map((line) => line.text)).toEqual(["Vitória faz proposta: R$ 1 por mês até 2026"]);
  });

  test("stopping for the window adds a line saying it closes tomorrow", () => {
    const closing = playToMatchDay(on("2026-03-01", { ...game, fixtures: [] }), quietDay);
    expect(closing.stop).toBe("windowClosing");
    expect(closing.news).toEqual([{ date: "2026-03-02", text: WINDOW_WARNING, tone: "neutral" }]);
  });

  test("with no match ahead it gives up after the day limit", () => {
    const played = playToMatchDay({ ...game, coachClubId: null }, quietDay, 30);
    expect(played.state.date).toBe(addDays(game.date, 30));
    expect(played.stop).toBe("idle");
  });

  test("counts the days played on the way, for the autosave", () => {
    expect(playToMatchDay(game, quietDay).daysPlayed).toBe(daysBetween(game.date, firstMatch));
    expect(playToMatchDay(on(firstMatch), quietDay).daysPlayed).toBe(0);
  });

  test("a match day that is also the last day to ask still warns about the window", () => {
    const home = game.fixtures.find((f) => f.homeId === "bahia-ba");
    if (!home) throw new Error("Bahia has no home fixture");
    const fixtures = [{ ...home, date: "2026-03-02" }];
    const played = playToMatchDay(on("2026-03-01", { ...game, fixtures }), quietDay);
    expect(played.stop).toBe("matchDay");
    expect(played.news.map((line) => line.text)).toEqual([WINDOW_WARNING]);
  });
});
