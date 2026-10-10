import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "../engine/connectEngine.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import type { TurningPoint } from "../hub/turningPoints.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { Sacked } from "./Sacked.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

const firing: TurningPoint = {
  kind: "fired",
  firing: { type: "coachFired", clubId: "bahia-ba", date: "2026-06-10", isYou: true, position: 18, targetPosition: 10 },
};

async function services(points: TurningPoint[]): Promise<{ given: Services; closed: () => number }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  let closedCount = 0;
  const queue = [...points];
  const faked: EngineClient = {
    ...engine,
    turningPoint: async () => queue[0] ?? null,
    closeTurningPoint: async () => {
      queue.shift();
      closedCount++;
    },
  };
  return { given: { engine: faked, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }, closed: () => closedCount };
}

function openSacked(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/sacked", element: <Sacked /> },
      { path: "/offers", element: <p>Propostas abertas</p> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/sacked"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("the sacking shows where the club stood against the board's target, then opens the offers", async () => {
  const { given, closed } = await services([firing]);
  openSacked(given);
  expect(await screen.findByRole("heading", { name: "Demitido" })).toBeTruthy();
  expect(screen.getByText("18º")).toBeTruthy();
  expect(screen.getByText("10º")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Ver propostas" }));
  await screen.findByText("Propostas abertas");
  expect(closed()).toBe(1);
});

test("with no sacking waiting the screen sends the coach to his club", async () => {
  const { given } = await services([]);
  openSacked(given);
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
});
