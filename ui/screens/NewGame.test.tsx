import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { NewGame } from "./NewGame.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

function openNewGame(): Services {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: null } };
  const router = createMemoryRouter(
    [
      { path: "/new-game", element: <NewGame /> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/new-game"] },
  );
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return services;
}

function clubList() {
  return within(screen.getByRole("list", { name: "Clubes" }));
}

test("searching narrows the club list by name, ignoring accents", async () => {
  openNewGame();
  await userEvent.type(screen.getByRole("searchbox", { name: "Buscar clube" }), "vitoria");
  expect(clubList().getAllByRole("button", { name: "Vitória" })).toHaveLength(2);
  expect(clubList().queryByRole("button", { name: "Bahia" })).toBeNull();
});

test("division and state filters narrow the club list together", async () => {
  openNewGame();
  await userEvent.click(screen.getByRole("button", { name: "Série A" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "BA");
  expect(clubList().getAllByRole("button")).toHaveLength(2);
  expect(clubList().getByRole("button", { name: "Bahia" })).toBeTruthy();
  expect(clubList().getByRole("button", { name: "Vitória" })).toBeTruthy();
});

test("each club shows its board's goal once the season is drawn", async () => {
  openNewGame();
  await waitFor(() => expect(clubList().getByRole("button", { name: "Flamengo" }).textContent).toContain("Título"), { timeout: 10_000 });
});

test("a club game starts at the chosen club and saves under the coach's name", async () => {
  const { engine, slots, game } = openNewGame();
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.click(screen.getByRole("button", { name: "Assumir o clube" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["coachClubId"])).toEqual({ coachClubId: "bahia-ba" });
  expect(await slots.list()).toMatchObject([{ id: "slot-1", coachName: "Rogério", coachClubId: "bahia-ba", division: "A" }]);
  expect(game.current).toEqual({ slotId: "slot-1", coachName: "Rogério" });
});

test("career mode starts with no club and offers from small clubs", async () => {
  const { engine } = openNewGame();
  await userEvent.click(screen.getByRole("tab", { name: "Modo carreira" }));
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  const { coachClubId, coach } = await engine.read(["coachClubId", "coach"]);
  expect(coachClubId).toBeNull();
  expect(coach.careerMode).toBe(true);
  expect(coach.offers.length).toBeGreaterThan(0);
});

test("choosing a slot that holds a game asks before replacing it", async () => {
  const { slots } = openNewGame();
  const old = { id: "slot-1", gameSlotId: "slot-1", coachName: "Antigo", savedAt: "2026-10-01T12:00:00.000Z", date: "2026-05-01", season: 2026, coachClubId: "vitoria-ba", division: "A" as const };
  await slots.write(old, "old save");
  await userEvent.click(screen.getByRole("tab", { name: "Modo carreira" }));
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(await screen.findByRole("radio", { name: /Jogo 1/ }));
  await userEvent.click(screen.getByRole("button", { name: "Começar" }));

  const confirm = screen.getByRole("alertdialog", { name: "Substituir o Jogo 1?" });
  expect(document.activeElement).toBe(within(confirm).getByText("Substituir o Jogo 1?"));
  await userEvent.click(within(confirm).getByRole("button", { name: "Escolher outro" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Começar" }));
  expect(await slots.read("slot-1")).toBe("old save");

  await userEvent.click(screen.getByRole("button", { name: "Começar" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Substituir" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await slots.list()).toMatchObject([{ id: "slot-1", coachName: "Rogério", coachClubId: null }]);
});

test("an empty slot is picked by default so a fresh game never asks to replace", async () => {
  const { slots } = openNewGame();
  await slots.write({ id: "slot-1", gameSlotId: "slot-1", coachName: "Antigo", savedAt: "2026-10-01T12:00:00.000Z", date: "2026-05-01", season: 2026, coachClubId: null, division: null }, "old");
  await userEvent.click(screen.getByRole("tab", { name: "Modo carreira" }));
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  expect(await screen.findByRole("radio", { name: /Jogo 2/ })).toHaveProperty("checked", true);
});
