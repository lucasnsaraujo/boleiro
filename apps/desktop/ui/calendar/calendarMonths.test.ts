import { expect, test } from "vitest";
import type { Fixture } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { calendarMonths, type CalendarEntry } from "./calendarMonths.js";

const game = newGameFromFiles(5, { coachClubId: "bahia-ba" }, bundledGameFiles);
const own = game.fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").toSorted((a, b) => a.date.localeCompare(b.date));

const matches = (entries: readonly CalendarEntry[]) => entries.flatMap((e) => (e.kind === "match" ? [e] : []));

test("the season has twelve months and every coach fixture sits in its own month", () => {
  const months = calendarMonths(game);
  expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(months.flatMap((m) => matches(m.entries)).length).toBe(own.length);
  for (const { month, entries } of months) {
    for (const entry of entries) expect(Number(entry.date.slice(5, 7))).toBe(month);
  }
});

test("entries run in date order", () => {
  for (const { entries } of calendarMonths(game)) {
    const dates = entries.map((e) => e.date);
    expect(dates).toEqual(dates.toSorted());
  }
});

test("a fixture shows the competition, the side and the opponent", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const entry = matches(calendarMonths(game).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  const isHome = fixture.homeId === "bahia-ba";
  expect(entry).toMatchObject({ competition: "Baiano", isHome, opponentId: isHome ? fixture.awayId : fixture.homeId, result: null });
});

test("a played fixture gets its score and whether the coach's club won", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const ownGoals = { homeGoals: 3, awayGoals: 0 };
  const result = fixture.homeId === "bahia-ba" ? ownGoals : { homeGoals: 0, awayGoals: 3 };
  const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === fixture.id ? { ...f, result } : f));
  const entry = matches(calendarMonths({ ...game, fixtures }).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  expect(entry?.result).toEqual({ homeGoals: result.homeGoals, awayGoals: result.awayGoals, outcome: "win", onPenalties: false });
});

test("a draw settled on penalties counts for the side that went through", () => {
  const fixture = own[0];
  if (!fixture) throw new Error("no fixture");
  const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === fixture.id ? { ...f, result: { homeGoals: 1, awayGoals: 1, penaltyWinnerId: "bahia-ba" } } : f));
  const entry = matches(calendarMonths({ ...game, fixtures }).flatMap((m) => m.entries)).find((e) => e.fixtureId === fixture.id);
  expect(entry?.result).toMatchObject({ outcome: "win", onPenalties: true });
});

test("the transfer windows open and close on their dates, and their months are marked", () => {
  const months = calendarMonths(game);
  const windows = months.flatMap((m) => m.entries.flatMap((e) => (e.kind === "window" ? [[e.date, e.opens]] : [])));
  expect(windows).toEqual([
    ["2026-01-05", true],
    ["2026-03-03", false],
    ["2026-07-20", true],
    ["2026-09-11", false],
  ]);
  expect(months.filter((m) => m.hasWindow).map((m) => m.month)).toEqual([1, 2, 3, 7, 8, 9]);
});

test("a coach without a club still sees the windows, with no games", () => {
  const months = calendarMonths({ ...game, coachClubId: null });
  expect(months.flatMap((m) => matches(m.entries))).toEqual([]);
  expect(months.flatMap((m) => m.entries)).toHaveLength(4);
});
