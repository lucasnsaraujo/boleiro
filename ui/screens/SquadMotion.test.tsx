import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { Squad } from "./Squad.js";

const closers: (() => void)[] = [];
const animate = vi.fn((keyframes: Keyframe[]) => keyframes);

beforeEach(() => {
  // jsdom has no layout and no Web Animations: rows sit 40px apart in DOM order, and animate() is recorded.
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return Array.from(document.querySelectorAll("[data-flip]")).indexOf(this) * 40;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
});

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  animate.mockClear();
});

function prefersReducedMotion(isReduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: isReduced && query.includes("reduce"), media: query }));
}

async function sortByAge() {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  render(
    <ServicesContext value={services}>
      <RouterProvider router={createMemoryRouter([{ path: "/squad", element: <Squad /> }], { initialEntries: ["/squad"] })} />
    </ServicesContext>,
  );
  await screen.findByRole("heading", { name: "Elenco" });
  expect(animate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Idade" }));
  expect(animate).toHaveBeenCalled();
  return animate.mock.calls.map(([keyframes]) => keyframes.flatMap((frame) => Object.keys(frame)));
}

test("re-sorting the squad slides every row that changed place from where it was", async () => {
  prefersReducedMotion(false);
  const animated = await sortByAge();
  expect(animated.every((properties) => properties.includes("transform"))).toBe(true);
});

test("with reduced motion, re-sorted rows only fade back in", async () => {
  prefersReducedMotion(true);
  const animated = await sortByAge();
  expect(animated.every((properties) => properties.every((property) => property === "opacity"))).toBe(true);
});
