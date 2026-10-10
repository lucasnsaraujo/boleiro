import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { saveToSlot } from "../saves/saveToSlot.js";
import { StartMenu } from "./StartMenu.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

function services(): Services {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: null } };
}

async function saveGame({ engine, slots }: Services, id: string, coachClubId: string, coachName: string, savedAt: string) {
  await engine.newGame(1, { coachClubId });
  await saveToSlot(engine, slots, { id, coachName }, new Date(savedAt));
}

function openStartMenu(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <StartMenu /> },
      { path: "/hub", element: <p>Clube aberto</p> },
      { path: "/new-game", element: <p>Novo jogo aberto</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("with no saved games the main action is a new game", async () => {
  openStartMenu(services());
  await screen.findByText("Nenhum jogo salvo.");
  expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  expect(screen.getByRole("link", { name: "Novo jogo" })).toBeTruthy();
});

test("continue opens the most recently saved game", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  await saveGame(given, "slot-2", "vitoria-ba", "Tite", "2026-10-09T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await screen.findByText("Clube aberto");
  expect(await given.engine.read(["coachClubId"])).toEqual({ coachClubId: "vitoria-ba" });
  expect(given.game.current).toEqual({ slotId: "slot-2", coachName: "Tite" });
});

test("a saved game opens from the list", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  await saveGame(given, "slot-2", "vitoria-ba", "Tite", "2026-10-09T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: /Bahia.*Jogo 1/ }));
  await screen.findByText("Clube aberto");
  expect(await given.engine.read(["coachClubId"])).toEqual({ coachClubId: "bahia-ba" });
});

test("deleting a slot asks first, and only a confirmed delete removes it", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Apagar Jogo 1" }));
  await userEvent.click(within(screen.getByRole("alertdialog", { name: "Apagar o Jogo 1?" })).getByRole("button", { name: "Cancelar" }));
  expect(await given.slots.list()).toHaveLength(1);

  await userEvent.click(screen.getByRole("button", { name: "Apagar Jogo 1" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar" }));
  await screen.findByText("Nenhum jogo salvo.");
  expect(await given.slots.list()).toEqual([]);
});
