/** Whether the system asks for less motion. Without `matchMedia` (tests, old engines) the answer is yes. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}
