import { afterEach, expect, test, vi } from "vitest";
import { liftRow, tintRow } from "./rowSlides.js";

type Animated = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };

function rowRecording(): { row: HTMLElement; calls: Animated[] } {
  const row = document.createElement("tr");
  const calls: Animated[] = [];
  row.animate = (keyframes, options) => {
    calls.push({ keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions });
    return {} as Animation;
  };
  return { row, calls };
}

const lessMotion = (isReduced: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: isReduced && query.includes("reduce") }));

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a re-sorted row rides from where it was, higher the farther it travels; with less motion it only fades back in", () => {
  lessMotion(false);
  const near = rowRecording();
  const far = rowRecording();
  const lift = liftRow(24);
  lift(near.row, 24);
  lift(far.row, -24 * 6);
  expect(near.calls[0]?.keyframes[0]).toMatchObject({ transform: "translateY(24px)", zIndex: "2" });
  expect(far.calls[0]?.keyframes[0]).toMatchObject({ transform: "translateY(-144px)", zIndex: "7" });

  lessMotion(true);
  const still = rowRecording();
  lift(still.row, 24);
  expect(still.calls[0]?.keyframes.some((frame) => "transform" in frame)).toBe(false);
});

test("a row that rose glows green and one that fell glows red as it slides; with less motion only the glow fades", () => {
  lessMotion(false);
  const rose = rowRecording();
  const fell = rowRecording();
  const tint = tintRow({ duration: 1100 });
  tint(rose.row, 40);
  tint(fell.row, -40);
  expect(String(rose.calls[0]?.keyframes[0]?.boxShadow)).toContain("--green");
  expect(String(fell.calls[0]?.keyframes[0]?.boxShadow)).toContain("--red");
  expect(rose.calls[0]?.keyframes[0]).toMatchObject({ transform: "translateY(40px)" });

  lessMotion(true);
  const still = rowRecording();
  tint(still.row, 40);
  expect(still.calls[0]?.keyframes.some((frame) => "transform" in frame)).toBe(false);
  expect(String(still.calls[0]?.keyframes[0]?.boxShadow)).toContain("--green");
});
