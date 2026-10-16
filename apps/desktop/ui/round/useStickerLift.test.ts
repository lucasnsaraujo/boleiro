import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { STICKERS_DOWN_AFTER_GOAL_MS, useStickerLift } from "./useStickerLift.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

type Props = { goals: number; isInPlay: boolean };

test("the score stickers lift while the ball is in play and drop back as soon as the clock stops", () => {
  const { result, rerender } = renderHook((props: Props) => useStickerLift(props.goals, props.isInPlay), { initialProps: { goals: 0, isInPlay: false } });
  expect(result.current.isLifted).toBe(false);
  rerender({ goals: 0, isInPlay: true });
  expect(result.current.isLifted).toBe(true);
  rerender({ goals: 0, isInPlay: false });
  expect(result.current.isLifted).toBe(false);
});

test("a goal drops the stickers back full size, and they lift again a moment later if the ball is still in play", () => {
  const { result, rerender } = renderHook((props: Props) => useStickerLift(props.goals, props.isInPlay), { initialProps: { goals: 0, isInPlay: true } });
  rerender({ goals: 1, isInPlay: true });
  expect(result.current).toEqual({ isLifted: false, isGoalHeld: true });
  act(() => vi.advanceTimersByTime(STICKERS_DOWN_AFTER_GOAL_MS - 100));
  expect(result.current.isLifted).toBe(false);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toEqual({ isLifted: true, isGoalHeld: false });
});

test("coming back to a match with goals already in lifts the stickers at once", () => {
  const { result } = renderHook((props: Props) => useStickerLift(props.goals, props.isInPlay), { initialProps: { goals: 3, isInPlay: true } });
  expect(result.current.isLifted).toBe(true);
});
