import { createMemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { withScreenTransitions } from "./withScreenTransitions.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const routes = [{ path: "/" }, { path: "/hub" }, { path: "/tables" }];

function openAt(pathname: string) {
  document.body.innerHTML = '<main class="screen"><button>Jogar rodada</button></main>';
  const router = withScreenTransitions(createMemoryRouter(routes, { initialEntries: [pathname] }));
  const seen: boolean[] = [];
  router.subscribe((_, { viewTransitionOpts }) => seen.push(viewTransitionOpts !== undefined));
  const screen = document.querySelector("main");
  if (!screen) throw new Error("no screen");
  return { router, seen, screen };
}

test("every change to another screen asks for a view transition", async () => {
  const { router, seen } = openAt("/");
  await router.navigate("/hub");
  await router.navigate("/tables", { replace: true });
  // A Link passes every option it has, unset ones as undefined.
  await router.navigate("/hub", { viewTransition: undefined });
  expect(seen).toEqual([true, true, true]);
});

test("a screen change can still opt out of the transition", async () => {
  const { router, seen } = openAt("/");
  await router.navigate("/hub", { viewTransition: false });
  expect(seen).toEqual([false]);
});

test("the leaving screen is captured for the transition and stops taking clicks the moment the change starts", () => {
  const { router, screen } = openAt("/hub");
  void router.navigate("/tables");
  expect(screen.style.viewTransitionName).toBe("shell-screen");
  expect(screen.hasAttribute("inert")).toBe(true);
  expect(screen.getAttribute("aria-hidden")).toBe("true");
});

test("a change to the same screen, even with a query or hash, runs no transition and leaves the screen usable", async () => {
  const { router, seen, screen } = openAt("/hub");
  await router.navigate("/hub");
  await router.navigate("/hub?tab=2");
  await router.navigate({ pathname: "/hub", hash: "#inbox" });
  expect(seen).toEqual([false, false, false]);
  expect(screen.hasAttribute("inert")).toBe(false);
  expect(screen.style.viewTransitionName).toBe("");
});

test("a relative change that resolves to another screen still counts as leaving", () => {
  const { router, screen } = openAt("/hub");
  void router.navigate("../tables");
  expect(screen.hasAttribute("inert")).toBe(true);
});
