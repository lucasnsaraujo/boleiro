import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { Saves } from "./Saves.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-2", coachName: "Tite" } } };
}

function openSaves(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/saves", element: <Saves /> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/saves"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

const slotsList = () => screen.findByRole("list", { name: "Vagas" });

test("every slot shows: the autosave and the game slots, the empty ones as free", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "autosave", { slotId: "slot-2", coachName: "Tite" });
  openSaves(given);
  await within(await slotsList()).findByRole("button", { name: /^Automático · Bahia/ });
  const cards = within(await slotsList()).getAllByRole("listitem");
  expect(cards.map((card) => card.textContent)).toEqual([
    expect.stringContaining("Automático"),
    expect.stringContaining("Vaga livre"),
    expect.stringContaining("Vaga livre"),
    expect.stringContaining("Vaga livre"),
  ]);
  expect(cards[0]?.textContent).toContain("Bahia");
});

test("Salvar agora writes the open game into its own slot", async () => {
  openSaves(await services());
  await slotsList();
  await userEvent.click(screen.getByRole("button", { name: "Salvar agora" }));
  const second = await within(await slotsList()).findByRole("button", { name: /^Jogo 2 · Bahia/ });
  expect(second.textContent).toContain("Tite");
});

test("a picked save opens in the game, and the coach lands on his club", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-1", { slotId: "slot-1", coachName: "Abel" });
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 1 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Carregar este jogo" }));
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
  expect(given.game.current).toEqual({ slotId: "slot-1", coachName: "Abel" });
});

test("a save is deleted only after the coach confirms it", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-3", { slotId: "slot-3", coachName: "Tite" });
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 3 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar o Jogo 3" }));
  await waitFor(async () => expect(await given.slots.list()).toEqual([]));
  await waitFor(() => expect(within(screen.getByRole("list", { name: "Vagas" })).getAllByRole("listitem").at(-1)?.textContent).toContain("Vaga livre"));
});
