import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Moment } from "./Moment.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function retired(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba", coachName: "Rui Tavares" } });
  await engine.apply({ type: "retireCoach" });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Rui Tavares" } } };
}

function open(given: Services, at = "/moment") {
  const router = createMemoryRouter(
    [
      { path: "/moment", element: <Moment /> },
      { path: "/hub", element: <p>Clube aberto</p> },
      { path: "/trajectory", element: <p>Trajetória aberta</p> },
    ],
    { initialEntries: [at] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("with less motion asked for, the farewell shows its last frame at once, and closing the album sees it through", async () => {
  const given = await retired();
  open(given);
  const scene = await screen.findByRole("region", { name: "Aposentadoria: Rui Tavares" });
  await screen.findByRole("button", { name: "Fechar o álbum" });
  expect(scene.getAttribute("data-state")).toBe("ended");
  expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Fechar o álbum" }));
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
  expect(await given.engine.moment()).toBeNull();
});

test("a moment replayed from the trajectory goes back to it and stays seen", async () => {
  const given = await retired();
  const farewell = await given.engine.moment();
  if (!farewell) throw new Error("no farewell waiting");
  await given.engine.apply({ type: "closeMoment" });
  open(given, `/moment?replay=${encodeURIComponent(farewell.id)}`);
  await userEvent.click(await screen.findByRole("button", { name: "Voltar à trajetória" }));
  expect(await screen.findByText("Trajetória aberta")).toBeTruthy();
  expect(await given.engine.moment()).toBeNull();
});

test("with no moment waiting, the screen goes back to the club", async () => {
  const given = await retired();
  await given.engine.apply({ type: "closeMoment" });
  open(given);
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
});
