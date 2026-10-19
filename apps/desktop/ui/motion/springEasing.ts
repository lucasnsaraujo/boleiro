import { EASE } from "./easing.js";

/** A unit mass on a spring: `stiffness` pulls it to the target, `damping` slows it down. */
export type Spring = { stiffness: number; damping: number };

// Settled once it stays within 0.1% of the target and is nearly still.
const REST = 0.001;
const STEP_S = 1 / 120;
const MAX_S = 3;
const POINTS = 40;

function positionAt({ stiffness, damping }: Spring, t: number): number {
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  if (zeta >= 1) {
    const r1 = -omega * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -omega * (zeta + Math.sqrt(zeta * zeta - 1));
    if (r1 === r2) return 1 - Math.exp(r1 * t) * (1 - r1 * t);
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
}

function settleTime(spring: Spring): number {
  let t = 0;
  let last = 0;
  while (t < MAX_S) {
    t += STEP_S;
    const x = positionAt(spring, t);
    if (Math.abs(1 - x) < REST && Math.abs(x - last) / STEP_S < REST * 10) return t;
    last = x;
  }
  return MAX_S;
}

/**
 * The spring's motion from 0 to 1 as a CSS `linear()` easing and the time it takes to settle, in ms,
 * so WAAPI and CSS animations move with real physics instead of a fixed curve.
 */
export function springEasing(spring: Spring): { easing: string; duration: number } {
  const seconds = settleTime(spring);
  const points = Array.from({ length: POINTS + 1 }, (_, i) => (i === POINTS ? 1 : Number(positionAt(spring, (seconds * i) / POINTS).toFixed(4))));
  return { easing: `linear(${points.join(", ")})`, duration: Math.round(seconds * 1000) };
}

/** `springEasing`, or an expo-out over the same time where the engine has no `linear()` easing (Safari before 17.2). */
export function springTiming(spring: Spring): { easing: string; duration: number } {
  const timing = springEasing(spring);
  const hasLinear = typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)");
  return hasLinear ? timing : { easing: EASE.out, duration: timing.duration };
}
