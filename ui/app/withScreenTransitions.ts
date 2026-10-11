import { resolvePath, type DataRouter, type RouterNavigateOptions, type To } from "react-router";

const isAnotherScreen = (router: DataRouter, to: To | null) => {
  const current = router.state.location.pathname;
  return to !== null && resolvePath(to, current).pathname !== current;
};

/**
 * Hands the leaving screen to the transition: it alone is captured (shell.css animates it out), so the
 * arriving screen is never a snapshot and takes clicks from its first frame. The transition holds the
 * new screen back for a frame or two while it captures the old one, and in that gap the old screen may
 * already be usable again (a "Jogar rodada" that has finished), so it also goes inert and out of the
 * accessibility tree: a second press can't act on a screen that is leaving. The new screen is a fresh
 * `main` (Shell keys it by path), so nothing needs undoing.
 */
function leaveScreen() {
  const leaving = document.querySelector<HTMLElement>("main.screen");
  if (!leaving) return;
  leaving.style.viewTransitionName = "shell-screen";
  leaving.setAttribute("inert", "");
  leaving.setAttribute("aria-hidden", "true");
}

/**
 * Turns on a View Transition for every change to another screen, so links and `navigate` calls need no
 * flag of their own and the motion lives in shell.css. The router owns the transition: a click during
 * one skips it at once, and React runs the new screen's effects (its data load) without waiting for it.
 */
export function withScreenTransitions(router: DataRouter): DataRouter {
  const navigate = router.navigate.bind(router);
  function navigateWithTransition(to: number): Promise<void>;
  function navigateWithTransition(to: To | null, opts?: RouterNavigateOptions): Promise<void>;
  function navigateWithTransition(to: To | number | null, opts?: RouterNavigateOptions): Promise<void> {
    if (typeof to === "number") return navigate(to);
    const isLeaving = isAnotherScreen(router, to);
    const viewTransition = opts?.viewTransition ?? isLeaving;
    if (viewTransition && isLeaving) leaveScreen();
    return navigate(to, { ...opts, viewTransition });
  }
  router.navigate = navigateWithTransition;
  return router;
}
