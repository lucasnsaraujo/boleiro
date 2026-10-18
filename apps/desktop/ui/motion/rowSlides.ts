import { EASE, DURATION } from "./easing.js";
import { prefersReducedMotion } from "./reducedMotion.js";
import { springTiming } from "./springEasing.js";

// Damping ratio 0.94: rows settle with weight and no visible overshoot.
const LIFT = springTiming({ stiffness: 500, damping: 42 });
// A moving row rides one layer higher for each row it travels, up to 9, under a sticky header at 10.
const LAYERS = 9;
const ROSE = "color-mix(in srgb, var(--green) 22%, transparent)";
const FELL = "color-mix(in srgb, var(--red) 18%, transparent)";

/**
 * FLIP movement for a table whose rows are `rowHeight` px tall: a row that changed place slides from where it
 * was on a spring, lifted with a shadow, riding higher over the others the farther it travels. With reduced
 * motion it only fades back in.
 */
export function liftRow(rowHeight: number): (row: HTMLElement, offset: number) => void {
  return (row, offset) => {
    if (typeof row.animate !== "function") return;
    if (prefersReducedMotion()) {
      row.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: DURATION.base, easing: EASE.out });
      return;
    }
    const zIndex = String(Math.min(LAYERS, 1 + Math.round(Math.abs(offset) / rowHeight)));
    row.animate(
      [
        { transform: `translateY(${offset}px)`, boxShadow: "0 10px 22px rgba(20, 35, 26, 0.28)", zIndex },
        { transform: "none", boxShadow: "0 0 0 rgba(20, 35, 26, 0)", zIndex },
      ],
      LIFT,
    );
  };
}

/**
 * FLIP movement for a ranking: a row that changed place slides from where it was, glowing green if it rose and
 * red if it fell, the glow holding past the slide before it fades. With reduced motion only the glow fades.
 */
export function tintRow({ duration, delay = 0 }: { duration: number; delay?: number }): (row: HTMLElement, offset: number) => void {
  return (row, offset) => {
    if (typeof row.animate !== "function") return;
    const glow = `inset 0 0 0 999px ${offset > 0 ? ROSE : FELL}`;
    const slides = !prefersReducedMotion();
    const at = (y: number) => (slides ? { transform: `translateY(${y}px)` } : {});
    row.animate(
      [
        { ...at(offset), boxShadow: glow },
        { ...at(0), boxShadow: glow, offset: 0.55 },
        { ...at(0), boxShadow: "inset 0 0 0 999px transparent" },
      ],
      { duration, delay, easing: EASE.out, fill: "backwards" },
    );
  };
}
