import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
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
  await engine.apply({ type: "newGame", seed: 1, choices: { coachClubId } });
  await saveToSlot(engine, slots, id, { slotId: id, coachName }, new Date(savedAt));
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

test("continuing from the autosave keeps saving into the game's own slot", async () => {
  const given = services();
  await saveGame(given, "slot-2", "bahia-ba", "Tite", "2026-10-01T12:00:00Z");
  await saveToSlot(given.engine, given.slots, "autosave", { slotId: "slot-2", coachName: "Tite" }, new Date("2026-10-09T12:00:00Z"));
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await screen.findByText("Clube aberto");
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

test("other careers list each other game once, by its newest save, while Carregar jogo lists every save", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  await saveGame(given, "slot-2", "vitoria-ba", "Tite", "2026-10-05T12:00:00Z");
  await given.engine.apply({ type: "load", save: await given.slots.read("slot-1") });
  await saveToSlot(given.engine, given.slots, "autosave", { slotId: "slot-1", coachName: "Renato" }, new Date("2026-10-09T12:00:00Z"));
  openStartMenu(given);
  const others = await screen.findByRole("list", { name: "Outras carreiras" });
  expect(within(others).getAllByRole("button").map((row) => row.textContent)).toEqual([expect.stringMatching(/Vitória.*Tite.*Jogo 2/)]);
  expect(screen.getByRole("region", { name: "Continuar" }).textContent).toMatch(/Bahia.*Renato.*Automático/);

  await userEvent.click(screen.getByRole("button", { name: "Carregar jogo" }));
  const saves = within(screen.getByRole("dialog", { name: "Jogos salvos" })).getByRole("list");
  expect(within(saves).getAllByRole("button", { name: /^(Bahia|Vitória)/ })).toHaveLength(3);
});

test("the thank-you to Brasfoot opens from its sticker and from typing brasfoot on the start menu", async () => {
  openStartMenu(services());
  await screen.findByText("Nenhum jogo salvo.");
  await userEvent.click(screen.getByRole("button", { name: "Uma homenagem ao Brasfoot" }));
  expect(screen.getByRole("dialog", { name: "Valeu, Brasfoot" })).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Valeu, Brasfoot" })).toBeNull();

  await userEvent.keyboard("brasfoot");
  expect(screen.getByRole("dialog", { name: "Valeu, Brasfoot" })).toBeTruthy();
});

test("deleting a slot asks first, and only a confirmed delete removes it", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Carregar jogo" }));
  const opener = await screen.findByRole("button", { name: "Apagar Jogo 1" });
  await userEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByText("Apagar o Jogo 1?"));
  await userEvent.click(within(screen.getByRole("alertdialog", { name: "Apagar o Jogo 1?" })).getByRole("button", { name: "Cancelar" }));
  expect(document.activeElement).toBe(opener);
  expect(await given.slots.list()).toHaveLength(1);

  await userEvent.click(screen.getByRole("button", { name: "Apagar Jogo 1" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar" }));
  await screen.findByText("Nenhum jogo salvo.");
  expect(await given.slots.list()).toEqual([]);
});

test("over a game with unsaved play, Continuar, a career, a listed save and Novo jogo all ask before throwing it away", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  await saveGame(given, "slot-2", "vitoria-ba", "Tite", "2026-10-09T12:00:00Z");
  given.game.current = { slotId: "slot-3", coachName: "Abel", hasUnsavedPlay: true };
  openStartMenu(given);
  const cancel = async () => {
    const question = screen.getByRole("alertdialog", { name: "Salvar o jogo aberto?" });
    await userEvent.click(within(question).getByRole("button", { name: "Cancelar" }));
  };
  await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await cancel();
  await userEvent.click(screen.getByRole("button", { name: /Bahia.*Jogo 1/ }));
  await cancel();
  await userEvent.click(screen.getByRole("link", { name: "Novo jogo" }));
  await cancel();
  await userEvent.click(screen.getByRole("button", { name: "Carregar jogo" }));
  await userEvent.click(within(screen.getByRole("dialog", { name: "Jogos salvos" })).getByRole("button", { name: /^Bahia/ }));
  await cancel();
  expect(given.game.current).toEqual({ slotId: "slot-3", coachName: "Abel", hasUnsavedPlay: true });
  expect(screen.queryByText("Clube aberto")).toBeNull();
  expect(screen.queryByText("Novo jogo aberto")).toBeNull();

  await userEvent.click(within(screen.getByRole("dialog", { name: "Jogos salvos" })).getByRole("button", { name: /^Bahia/ }));
  await userEvent.click(within(screen.getByRole("alertdialog", { name: "Salvar o jogo aberto?" })).getByRole("button", { name: "Descartar" }));
  await screen.findByText("Clube aberto");
  expect(given.game.current).toEqual({ slotId: "slot-1", coachName: "Renato" });
});

test("Novo jogo, once the coach drops the unsaved play, goes on to the new game", async () => {
  const given = services();
  given.game.current = { slotId: "slot-3", coachName: "Abel", hasUnsavedPlay: true };
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("link", { name: "Novo jogo" }));
  await userEvent.click(within(screen.getByRole("alertdialog", { name: "Salvar o jogo aberto?" })).getByRole("button", { name: "Descartar" }));
  expect(await screen.findByText("Novo jogo aberto")).toBeTruthy();
});

test("after a delete is confirmed, focus stays in the saves sheet instead of falling off the page", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  await saveGame(given, "slot-2", "vitoria-ba", "Tite", "2026-10-09T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Carregar jogo" }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar Jogo 1" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Apagar Jogo 1" })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Jogos salvos" }));
});

test("deleting the last save closes the sheet and leaves focus on Novo jogo, the one way on", async () => {
  const given = services();
  await saveGame(given, "slot-1", "bahia-ba", "Renato", "2026-10-01T12:00:00Z");
  openStartMenu(given);
  await userEvent.click(await screen.findByRole("button", { name: "Carregar jogo" }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar Jogo 1" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar" }));
  await screen.findByText("Nenhum jogo salvo.");
  expect(screen.queryByRole("dialog", { name: "Jogos salvos" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Novo jogo" }));
});
