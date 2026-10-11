import { createMemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { withScreenTransitions } from "./withScreenTransitions.js";

afterEach(() => {
  document.body.innerHTML = "";
});

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

test("the leaving screen stops taking clicks the moment a screen change starts", () => {
  document.body.innerHTML = '<main class="screen"><button>Jogar rodada</button></main>';
  const router = withScreenTransitions(createMemoryRouter(routes, { initialEntries: ["/hub"] }));
  void router.navigate("/tables");
  const leaving = document.querySelector("main");
  expect(leaving?.hasAttribute("inert")).toBe(true);
  expect(leaving?.getAttribute("aria-hidden")).toBe("true");
});

test("a change to the same screen leaves it usable", () => {
  document.body.innerHTML = '<main class="screen"><button>Jogar rodada</button></main>';
  const router = withScreenTransitions(createMemoryRouter(routes, { initialEntries: ["/hub"] }));
  void router.navigate("/hub");
  expect(document.querySelector("main")?.hasAttribute("inert")).toBe(false);
});
