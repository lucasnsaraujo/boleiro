import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Shell } from "../app/Shell.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { NewGameChoices } from "@boleiro/game-client/engine/createEngineSession";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Hub } from "./Hub.js";
import { Turn } from "./Turn.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const close of closers.splice(0)) close();
});

const TWO_COACHES: NewGameChoices = { coachClubId: "flamengo-rj", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] }, marketClockSeconds: 300 };

/** A game open inside the shell at `at`, with the round stubbed. */
async function openGame(at: string, choices: NewGameChoices = TWO_COACHES): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 3, choices });
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Ana e Bruno" } } };
  render(
    <ServicesContext value={services}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                element: <Shell />,
                children: [
                  { path: "/hub", element: <Hub /> },
                  { path: "/turn", element: <Turn /> },
                  { path: "/round", element: <p>Rodada aberta</p> },
                ],
              },
            ],
            { initialEntries: [at] },
          )}
        />
      </SoundProvider>
    </ServicesContext>,
  );
  return services;
}

test("the first hot-seat coach's hub names him and his turn, and passing it hands the seat to the next behind the hand-off", async () => {
  const { engine } = await openGame("/hub");
  expect((await screen.findByText("Ana", {}, { timeout: 10_000 })).closest("p")?.textContent).toContain("vez 1 de 2");
  await userEvent.click(screen.getByRole("button", { name: "Passar a vez" }));
  expect(await screen.findByRole("heading", { name: "Vez de Bruno" })).toBeTruthy();
  expect((await engine.read(["coachClubId"])).coachClubId).toBe("palmeiras-sp");
  expect(screen.queryByRole("navigation", { name: "Telas" })).toBeNull();
  const steps = [...screen.getByRole("list", { name: "Ordem dos técnicos" }).querySelectorAll("li")];
  expect(steps.map((step) => [step.textContent, step.className])).toEqual([
    ["Ana", "done"],
    ["2Bruno", "on"],
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Começar minha vez" }));
  expect((await screen.findByText("Bruno")).closest("p")?.textContent).toContain("vez 2 de 2");
  expect(screen.getByRole("button", { name: /Jogar rodada/ })).toBeTruthy();
});

test("the last coach's play on hands the seat back to the first coach behind the hand-off", async () => {
  const { engine } = await openGame("/hub");
  await engine.apply({ type: "passTurn" });
  cleanup();
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Ana e Bruno" } } }}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={createMemoryRouter([{ element: <Shell />, children: [{ path: "/hub", element: <Hub /> }, { path: "/turn", element: <Turn /> }] }], { initialEntries: ["/hub"] })} />
      </SoundProvider>
    </ServicesContext>,
  );
  await userEvent.click(await screen.findByRole("button", { name: /Jogar rodada/ }, { timeout: 10_000 }));
  expect(await screen.findByRole("heading", { name: "Vez de Ana" }, { timeout: 20_000 })).toBeTruthy();
});

test("a one-coach game has no hand-off: the screen goes back to the club", async () => {
  await openGame("/turn", { coachClubId: "flamengo-rj" });
  expect(await screen.findByRole("button", { name: /Jogar rodada/ }, { timeout: 10_000 })).toBeTruthy();
});
