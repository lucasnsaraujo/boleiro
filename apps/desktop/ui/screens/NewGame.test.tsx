import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import type { SlotMeta } from "@boleiro/game-client/saves/slotMeta";
import { NewGame } from "./NewGame.js";
import { pickOption } from "../controls/pickOption.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

/** Opens the screen over the given saved slots, which it reads as it opens. */
async function openNewGame(saved: { meta: SlotMeta; save: string }[] = []): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: null } };
  for (const { meta, save } of saved) await services.slots.write(meta, save);
  const router = createMemoryRouter(
    [
      { path: "/new-game", element: <NewGame /> },
      { path: "/hub", element: <p>Clube aberto</p> },
      { path: "/", element: <p>Início</p> },
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
  await openNewGame();
  await userEvent.type(screen.getByRole("searchbox", { name: "Buscar clube" }), "vitoria");
  expect(clubList().getAllByRole("button", { name: "Vitória" })).toHaveLength(2);
  expect(clubList().queryByRole("button", { name: "Bahia" })).toBeNull();
});

test("division and state filters narrow the club list together", async () => {
  await openNewGame();
  await pickOption(screen.getByRole("combobox", { name: "Divisão" }), "Série A");
  await pickOption(screen.getByRole("combobox", { name: "Estado" }), "BA");
  expect(clubList().getAllByRole("button")).toHaveLength(2);
  expect(clubList().getByRole("button", { name: "Bahia" })).toBeTruthy();
  expect(clubList().getByRole("button", { name: "Vitória" })).toBeTruthy();
});

test("a picked club shows its board's goal once the season is drawn", async () => {
  await openNewGame();
  await userEvent.click(clubList().getByRole("button", { name: "Flamengo" }));
  const facts = screen.getByRole("region", { name: "Seu técnico" });
  await waitFor(() => expect(within(facts).getByText("A diretoria quer").nextElementSibling?.textContent).toContain("Título"), { timeout: 10_000 });
});

test("each club sticker shows its squad's strength once the season is drawn", async () => {
  await openNewGame();
  await waitFor(() => expect(clubList().getByRole("button", { name: "Flamengo" }).textContent).toMatch(/Força \d+/), { timeout: 10_000 });
});

test("a club game starts at the chosen club and saves under the coach's name", async () => {
  const { engine, slots, game } = await openNewGame();
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["coachClubId"])).toEqual({ coachClubId: "bahia-ba" });
  expect(await slots.list()).toMatchObject([{ id: "slot-1", coachName: "Rogério", coachClubId: "bahia-ba", division: "A" }]);
  expect(game.current).toEqual({ slotId: "slot-1", coachName: "Rogério" });
});

test("the estaduais are on by default and switched off start a season without them", async () => {
  const { engine } = await openNewGame();
  const estaduais = screen.getByRole("button", { name: "Estaduais" });
  expect(estaduais.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(estaduais);
  expect(estaduais.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  const { competitions, playsStateChampionships } = await engine.read(["competitions", "playsStateChampionships"]);
  expect(playsStateChampionships).toBe(false);
  expect(Object.values(competitions).some((c) => c.kind === "state")).toBe(false);
});

test("career mode starts with no club and offers from small clubs", async () => {
  const { engine } = await openNewGame();
  await userEvent.click(screen.getByRole("button", { name: "Modo carreira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  const { coachClubId, coach } = await engine.read(["coachClubId", "coach"]);
  expect(coachClubId).toBeNull();
  expect(coach.careerMode).toBe(true);
  expect(coach.offers.length).toBeGreaterThan(0);
});

test("a career can't start without a coach's name and a club or career mode", async () => {
  await openNewGame();
  const start = screen.getByRole("button", { name: "Começar carreira" });
  expect(start).toHaveProperty("disabled", true);
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  expect(start).toHaveProperty("disabled", true);
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  expect(start).toHaveProperty("disabled", false);
});

test("choosing a slot that holds a game asks before replacing it", async () => {
  const old = { id: "slot-1", gameSlotId: "slot-1", coachName: "Antigo", savedAt: "2026-10-01T12:00:00.000Z", date: "2026-05-01", season: 2026, coachClubId: "vitoria-ba", division: "A" as const };
  const { slots } = await openNewGame([{ meta: old, save: "old save" }]);
  await userEvent.click(screen.getByRole("button", { name: "Modo carreira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(await screen.findByRole("radio", { name: /Jogo 1/ }));
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));

  const confirm = screen.getByRole("alertdialog", { name: "Substituir o Jogo 1?" });
  expect(document.activeElement).toBe(within(confirm).getByText("Substituir o Jogo 1?"));
  await userEvent.click(within(confirm).getByRole("button", { name: "Escolher outro" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Começar carreira" }));
  expect(await slots.read("slot-1")).toBe("old save");

  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Substituir" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await slots.list()).toMatchObject([{ id: "slot-1", coachName: "Rogério", coachClubId: null }]);
});

test("an empty slot is picked by default so a fresh game never asks to replace", async () => {
  await openNewGame([
    { meta: { id: "slot-1", gameSlotId: "slot-1", coachName: "Antigo", savedAt: "2026-10-01T12:00:00.000Z", date: "2026-05-01", season: 2026, coachClubId: null, division: null }, save: "old" },
  ]);
  expect(await screen.findByRole("radio", { name: /Jogo 2/ })).toHaveProperty("checked", true);
});

test("Voltar goes back to the start menu", async () => {
  await openNewGame();
  await userEvent.click(screen.getByRole("link", { name: "Voltar" }));
  expect(await screen.findByText("Início")).toBeTruthy();
});
