import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RoundMatch } from "@boleiro/game-client/round/liveRoundOf";
import { LivePitch } from "./LivePitch.js";

const MS_PER_MINUTE = 660;
const clubs = {
  vit: { id: "vit", shortName: "Vitória", colours: { primary: "#d7322a", secondary: "#111111" }, stadium: "Barradão" },
  bahia: { id: "bahia", shortName: "Bahia", colours: { primary: "#ffffff", secondary: "#1d4f9b" }, stadium: "Fonte Nova" },
};
const names = { b9: "Everaldo" };
const match: RoundMatch = {
  fixtureId: "ours",
  competitionId: "a",
  homeId: "vit",
  awayId: "bahia",
  events: [
    { type: "goal", minute: 10, clubId: "bahia", playerId: "b9" },
    { type: "halfTime", minute: 45 },
    { type: "fullTime", minute: 90 },
  ],
};
const formations = { home: "4-4-2", away: "4-3-3" } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  // jsdom lays nothing out and runs no animations: the board gets a size, and animations do nothing.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(192);
  Object.assign(HTMLElement.prototype, { animate: () => ({ cancel: () => undefined }), getAnimations: () => [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("a goal plays on the board at its minute, called out and tagged with the scorer, though the round hands it a fresh copy of the match every minute", () => {
  const board = (minute: number) => (
    <LivePitch match={{ ...match }} clubs={clubs} names={names} minute={minute} isRunning msPerMinute={MS_PER_MINUTE} formations={formations} />
  );
  const { container, rerender } = render(board(9));
  act(() => vi.advanceTimersByTime(MS_PER_MINUTE));
  rerender(board(10));
  act(() => vi.advanceTimersByTime(100));
  expect(container.querySelector(".lp-chip b")?.textContent).toBe("Gol");
  expect(container.querySelector(".lp-tag b")?.textContent).toBe("Everaldo");
});
