import { afterEach, expect, test, vi } from "vitest";
import { springEasing, springTiming } from "./springEasing.js";

const pointsOf = (easing: string) =>
  easing
    .replace(/^linear\(|\)$/g, "")
    .split(",")
    .map(Number);

test("a spring starts at rest, ends exactly on its target and is written as a CSS linear() curve", () => {
  const { easing } = springEasing({ stiffness: 260, damping: 30 });
  const points = pointsOf(easing);
  expect(easing.startsWith("linear(")).toBe(true);
  expect(points[0]).toBe(0);
  expect(points.at(-1)).toBe(1);
  expect(points.length).toBeGreaterThan(10);
});

test("a critically damped spring never passes its target, so nothing bounces", () => {
  const { easing } = springEasing({ stiffness: 260, damping: 2 * Math.sqrt(260) });
  expect(Math.max(...pointsOf(easing))).toBeLessThanOrEqual(1);
});

test("a lightly damped spring overshoots a little before it settles", () => {
  const { easing } = springEasing({ stiffness: 400, damping: 22 });
  expect(Math.max(...pointsOf(easing))).toBeGreaterThan(1);
});

test("a softer spring takes longer to settle", () => {
  const stiff = springEasing({ stiffness: 500, damping: 2 * Math.sqrt(500) });
  const soft = springEasing({ stiffness: 120, damping: 2 * Math.sqrt(120) });
  expect(soft.duration).toBeGreaterThan(stiff.duration);
  expect(stiff.duration).toBeGreaterThan(100);
  expect(soft.duration).toBeLessThan(2000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("an engine with linear() easing gets the spring itself", () => {
  vi.spyOn(CSS, "supports").mockReturnValue(true);
  const spring = { stiffness: 260, damping: 30 };
  expect(springTiming(spring)).toEqual(springEasing(spring));
});

test("an engine without linear() easing gets an expo-out over the spring's own time", () => {
  vi.spyOn(CSS, "supports").mockReturnValue(false);
  const spring = { stiffness: 260, damping: 30 };
  expect(springTiming(spring)).toEqual({ easing: "cubic-bezier(0.16, 1, 0.3, 1)", duration: springEasing(spring).duration });
});
