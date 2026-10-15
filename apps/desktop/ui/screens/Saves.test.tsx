import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { clubById, plateColours } from "../clubs/clubCatalog.js";
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

test("opening another save over a game with unsaved play asks first, and Descartar opens it", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-1", { slotId: "slot-1", coachName: "Abel" });
  given.game.current = { slotId: "slot-2", coachName: "Tite", hasUnsavedPlay: true };
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 1 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Carregar este jogo" }));
  const question = screen.getByRole("alertdialog", { name: "Salvar o jogo aberto?" });
  expect(question.textContent).toContain("o que foi jogado desde o último save");
  expect(given.game.current.slotId).toBe("slot-2");
  await userEvent.click(within(question).getByRole("button", { name: "Descartar" }));
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
  expect(given.game.current).toEqual({ slotId: "slot-1", coachName: "Abel" });
});

test("Salvar e continuar writes the open game into its own slot before opening the other save", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-1", { slotId: "slot-1", coachName: "Abel" });
  given.game.current = { slotId: "slot-2", coachName: "Tite", hasUnsavedPlay: true };
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 1 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Carregar este jogo" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Salvar e continuar" }));
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
  expect((await given.slots.list()).map((meta) => [meta.id, meta.coachName])).toEqual(expect.arrayContaining([["slot-2", "Tite"]]));
  expect(given.game.current).toEqual({ slotId: "slot-1", coachName: "Abel" });
});

test("Cancelar, or Escape, keeps the open game and hands focus back to Carregar este jogo", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-1", { slotId: "slot-1", coachName: "Abel" });
  given.game.current = { slotId: "slot-2", coachName: "Tite", hasUnsavedPlay: true };
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 1 · Bahia/ }));
  const load = screen.getByRole("button", { name: "Carregar este jogo" });
  await userEvent.click(load);
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(load);
  await userEvent.click(load);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Salvar o jogo aberto?" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(given.game.current.slotId).toBe("slot-2");
  expect(await given.slots.list()).toHaveLength(1);
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

test("deleting the save of the game open now says so before the coach confirms", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-2", { slotId: "slot-2", coachName: "Tite" });
  await saveToSlot(given.engine, given.slots, "slot-3", { slotId: "slot-3", coachName: "Abel" });
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 2 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
  expect(screen.getByRole("alertdialog").textContent).toContain("É o jogo aberto agora.");
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await userEvent.click(within(await slotsList()).getByRole("button", { name: /^Jogo 3 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
  expect(screen.getByRole("alertdialog").textContent).not.toContain("É o jogo aberto agora.");
});

test("a saved card prints its slot number and stripes in the ink that reads on its club's colour", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-2", { slotId: "slot-2", coachName: "Tite" });
  openSaves(given);
  const card = await within(await slotsList()).findByRole("button", { name: /^Jogo 2 · Bahia/ });
  const colours = clubById("bahia-ba")?.colours;
  expect(colours).toBeDefined();
  const ink = document.createElement("i");
  ink.style.color = plateColours(colours ?? { primary: "#000000", secondary: "#000000" }).text;
  const art = within(card).getByText("02").parentElement;
  expect(art?.style.color).toBe(ink.style.color);
});

test("while a save is being deleted, nothing else can save or load", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-3", { slotId: "slot-3", coachName: "Tite" });
  let finishRemoving = () => {};
  const remove = given.slots.remove.bind(given.slots);
  openSaves({ ...given, slots: { ...given.slots, list: given.slots.list.bind(given.slots), remove: (id) => new Promise<void>((resolve) => (finishRemoving = () => void remove(id).then(resolve))) } });
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 3 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar o Jogo 3" }));
  expect(screen.getByRole("button", { name: "Salvar agora" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Carregar este jogo" })).toHaveProperty("disabled", true);
  finishRemoving();
  await waitFor(() => expect(screen.getByRole("button", { name: "Salvar agora" })).toHaveProperty("disabled", false));
});

test("each game slot's number matches its name, and the autosave carries no number", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "autosave", { slotId: "slot-2", coachName: "Tite" });
  await saveToSlot(given.engine, given.slots, "slot-2", { slotId: "slot-2", coachName: "Tite" });
  openSaves(given);
  const cards = within(await slotsList());
  await cards.findByRole("button", { name: /^Jogo 2 · Bahia/ });
  expect(within(cards.getByRole("button", { name: /^Automático · Bahia/ })).queryByText(/^\d\d$/)).toBeNull();
  expect(within(cards.getByRole("button", { name: /^Jogo 2 · Bahia/ })).getByText(/^\d\d$/).textContent).toBe("02");
  expect(cards.getAllByRole("listitem").map((card) => card.textContent?.match(/^\d\d/)?.[0] ?? null)).toEqual([null, "01", "02", "03"]);
});

test("after a delete is confirmed, focus lands on the list of saves instead of falling off the page", async () => {
  const given = await services();
  await saveToSlot(given.engine, given.slots, "slot-3", { slotId: "slot-3", coachName: "Tite" });
  openSaves(given);
  await userEvent.click(await within(await slotsList()).findByRole("button", { name: /^Jogo 3 · Bahia/ }));
  await userEvent.click(screen.getByRole("button", { name: "Apagar" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Apagar o Jogo 3" }));
  expect(document.activeElement).toBe(screen.getByRole("list", { name: "Vagas" }));
  await waitFor(async () => expect(await given.slots.list()).toEqual([]));
  expect(document.activeElement).toBe(screen.getByRole("list", { name: "Vagas" }));
});
