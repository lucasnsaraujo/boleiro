import type { DataRouter, RouterNavigateOptions, To } from "react-router";

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
    return typeof to === "number" ? navigate(to) : navigate(to, { ...opts, viewTransition: opts?.viewTransition ?? true });
  }
  router.navigate = navigateWithTransition;
  return router;
}
