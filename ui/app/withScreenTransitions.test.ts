import { createMemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { withScreenTransitions } from "./withScreenTransitions.js";

const routes = [{ path: "/" }, { path: "/hub" }, { path: "/tables" }];

function transitionsOf(router: ReturnType<typeof createMemoryRouter>) {
  const seen: boolean[] = [];
  router.subscribe((_, { viewTransitionOpts }) => seen.push(viewTransitionOpts !== undefined));
  return seen;
}

test("every screen change asks for a view transition", async () => {
  const router = withScreenTransitions(createMemoryRouter(routes));
  const seen = transitionsOf(router);
  await router.navigate("/hub");
  await router.navigate("/tables", { replace: true });
  // A Link passes every option it has, unset ones as undefined.
  await router.navigate("/hub", { viewTransition: undefined });
  expect(seen).toEqual([true, true, true]);
});

test("a screen change can still opt out of the transition", async () => {
  const router = withScreenTransitions(createMemoryRouter(routes));
  const seen = transitionsOf(router);
  await router.navigate("/hub", { viewTransition: false });
  expect(seen).toEqual([false]);
});
