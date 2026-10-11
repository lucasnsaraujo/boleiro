import type { DataRouter, RouterNavigateOptions, To } from "react-router";

/**
 * The transition holds the new screen back for a frame or two while it captures the old one. In that
 * gap the old screen may already be usable again (a "Jogar rodada" that has finished), so it goes inert
 * and out of the accessibility tree at once: a second press can't act on a screen that is leaving.
 * The new screen is a fresh `main` (Shell keys it by path), so nothing needs undoing.
 */
function leaveScreen(router: DataRouter, to: To | null) {
  const pathname = typeof to === "string" ? to : to?.pathname;
  if (pathname === undefined || pathname === router.state.location.pathname) return;
  const leaving = document.querySelector("main.screen");
  leaving?.setAttribute("inert", "");
  leaving?.setAttribute("aria-hidden", "true");
}

/**
 * Turns on a View Transition for every screen change, so links and `navigate` calls need no flag of
 * their own and the motion lives in shell.css. The router owns the transition: a click during one
 * skips it at once, and React runs the new screen's effects (its data load) without waiting for it.
 */
export function withScreenTransitions(router: DataRouter): DataRouter {
  const navigate = router.navigate.bind(router);
  function navigateWithTransition(to: number): Promise<void>;
  function navigateWithTransition(to: To | null, opts?: RouterNavigateOptions): Promise<void>;
  function navigateWithTransition(to: To | number | null, opts?: RouterNavigateOptions): Promise<void> {
    if (typeof to === "number") return navigate(to);
    leaveScreen(router, to);
    return navigate(to, { ...opts, viewTransition: opts?.viewTransition ?? true });
  }
  router.navigate = navigateWithTransition;
  return router;
}
