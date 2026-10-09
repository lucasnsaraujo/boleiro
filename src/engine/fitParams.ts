import type { EngineParams } from "./match.js";

/** Coordinate descent: nudges each tuned param up and down, keeps any move that lowers the error, halves the step when none does. */
export function fitParams(start: EngineParams, tuned: readonly (keyof EngineParams)[], error: (params: EngineParams) => number): EngineParams {
  let best = { ...start };
  let bestError = error(best);
  let step = 0.1;
  while (step > 0.0005) {
    let improved = false;
    for (const key of tuned) {
      for (const direction of [1, -1]) {
        const candidate = { ...best, [key]: best[key] + direction * step * Math.max(Math.abs(best[key]), 0.05) };
        const candidateError = error(candidate);
        if (candidateError < bestError) {
          best = candidate;
          bestError = candidateError;
          improved = true;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return best;
}
