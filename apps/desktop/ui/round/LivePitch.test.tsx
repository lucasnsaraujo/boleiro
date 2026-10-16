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
  Object.assign(Element.prototype, { animate: animate.mockImplementation(() => ({ cancel: () => undefined })), getAnimations: () => [] });
});

const animate = vi.fn<(keyframes: Keyframe[]) => { cancel: () => void }>();
const MOVING = ["transform", "translate", "scale", "rotate"];

/** Whether the system asks for less motion, as the board reads it. */
function prefersReducedMotion(isReduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: isReduced && query.includes("reduce") }));
}

/** The board running up to a goal at minute 10 and just past it. */
function playToTheGoal() {
  const board = (minute: number) => (
    <LivePitch match={{ ...match }} clubs={clubs} names={names} minute={minute} isRunning msPerMinute={MS_PER_MINUTE} formations={formations} />
  );
  const { container, rerender } = render(board(9));
  act(() => vi.advanceTimersByTime(MS_PER_MINUTE));
  rerender(board(10));
  act(() => vi.advanceTimersByTime(100));
  return container;
}

const movingKeyframes = () => animate.mock.calls.filter(([keyframes]) => keyframes.some((frame) => MOVING.some((property) => property in frame)));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  animate.mockReset();
});

test("a goal plays on the board at its minute, called out and tagged with the scorer, though the round hands it a fresh copy of the match every minute", () => {
  prefersReducedMotion(false);
  const container = playToTheGoal();
  expect(container.querySelector(".lp-chip b")?.textContent).toBe("Gol");
  expect(container.querySelector(".lp-tag b")?.textContent).toBe("Everaldo");
  expect(movingKeyframes().length).toBeGreaterThan(0);
});

test("with reduced motion the goal is still called out and tagged, but nothing on the board moves: the calls only fade", () => {
  prefersReducedMotion(true);
  const container = playToTheGoal();
  expect(container.querySelector(".lp-chip b")?.textContent).toBe("Gol");
  expect(container.querySelector(".lp-tag b")?.textContent).toBe("Everaldo");
  expect(animate).toHaveBeenCalled();
  expect(movingKeyframes()).toEqual([]);
});
