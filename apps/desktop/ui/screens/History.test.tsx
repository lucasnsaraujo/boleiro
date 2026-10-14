import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { History } from "./History.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openHistory(given: Services, entry = "/history") {
  const router = createMemoryRouter(
    [
      { path: "/history", element: <History /> },
      { path: "/offers", element: <p>Propostas abertas</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("the history opens on the coach's club", async () => {
  openHistory(await services("bahia-ba"));
  expect(await screen.findByRole("tab", { name: "Clube", selected: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Bahia" })).toBeTruthy();
});

test("a career coach with offers on the table goes from his career to the offers", async () => {
  openHistory(await services(null), "/history?aba=carreira");
  expect(await screen.findByRole("tab", { name: "Carreira", selected: true })).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Clube" })).toBeNull();
  await userEvent.click(screen.getByRole("link", { name: "Ver propostas" }));
  expect(await screen.findByText("Propostas abertas")).toBeTruthy();
});
