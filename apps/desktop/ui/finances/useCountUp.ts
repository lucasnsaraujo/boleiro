import { useLayoutEffect, useState } from "react";

const DURATION_MS = 900;

/** Keys already counted up, so a figure only counts up the first time it is shown. */
const counted = new Set<string>();

const prefersReducedMotion = () => typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `target`, counting up from zero with an ease-out the first time `key` is shown, then still.
 * A null key, a key already counted or reduced motion show `target` at once.
 */
export function useCountUp(target: number, key: string | null): number {
  const [shown, setShown] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!key || counted.has(key) || prefersReducedMotion()) return;
    counted.add(key);
    const start = performance.now();
    let frame = 0;
    let done = false;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      done = progress === 1;
      setShown(done ? null : Math.round(target * (1 - (1 - progress) ** 3)));
      if (!done) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Interrupted before the end (the screen left), so it counts up again next time.
      if (!done) counted.delete(key);
      setShown(null);
    };
  }, [key, target]);

  return shown ?? target;
}
