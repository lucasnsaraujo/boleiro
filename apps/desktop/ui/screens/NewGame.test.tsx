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
  expect((await engine.read(["eggs"])).eggs?.coachName).toBe("Rogério");
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

test("the mid-season window is on by default and switched off starts a game with only the window between seasons", async () => {
  const { engine } = await openNewGame();
  const midSeason = screen.getByRole("button", { name: "Janela no meio da temporada" });
  expect(midSeason.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(midSeason);
  expect(midSeason.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["hasMidSeasonWindow"])).toEqual({ hasMidSeasonWindow: false });
});

test("the house rule 'changes only in finals' is off by default and switched on starts a game that leaves other matches to the plans", async () => {
  const { engine } = await openNewGame();
  const finalsOnly = screen.getByRole("button", { name: "Mudanças só nas finais" });
  expect(finalsOnly.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(finalsOnly);
  expect(finalsOnly.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["manualChangesOnlyInFinals"])).toEqual({ manualChangesOnlyInFinals: true });
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

test("two coaches each name themselves and pick a club, and the game starts with both in turn order and a five-minute market clock", async () => {
  const { engine, game } = await openNewGame();
  await userEvent.click(screen.getByRole("button", { name: "Mais um técnico" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 1" }), "Ana");
  await userEvent.click(clubList().getByRole("button", { name: "Flamengo" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 2" }), "Bruno");
  await userEvent.click(clubList().getByRole("button", { name: "Palmeiras" }));
  await userEvent.click(screen.getByRole("button", { name: "Começar jogo" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.hotSeat()).toMatchObject({ seated: 0, coaches: [{ name: "Ana", clubId: "flamengo-rj" }, { name: "Bruno", clubId: "palmeiras-sp" }] });
  expect(await engine.read(["marketClockSeconds"])).toEqual({ marketClockSeconds: 300 });
  expect(game.current?.coachName).toBe("Ana e Bruno");
});

test("a club one coach took is closed to the others, and the game can't start until every coach has a name and a club", async () => {
  await openNewGame();
  await userEvent.click(screen.getByRole("button", { name: "Mais um técnico" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 1" }), "Ana");
  await userEvent.click(clubList().getByRole("button", { name: "Flamengo" }));
  await userEvent.click(screen.getByRole("button", { name: "Escolher o time do técnico 2" }));
  const flamengo = clubList().getByRole("button", { name: "Flamengo" });
  expect(flamengo.hasAttribute("disabled")).toBe(true);
  expect(flamengo.textContent).toContain("Ana");
  expect(screen.getByRole("button", { name: "Começar jogo" }).hasAttribute("disabled")).toBe(true);
});

test("two coaches can't share a name, even one written in other case, accents or spacing", async () => {
  await openNewGame();
  await userEvent.click(screen.getByRole("button", { name: "Mais um técnico" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 1" }), "Ana Lúcia");
  await userEvent.click(clubList().getByRole("button", { name: "Flamengo" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 2" }), "ana lucia");
  await userEvent.click(clubList().getByRole("button", { name: "Palmeiras" }));
  const second = screen.getByRole("textbox", { name: "Nome do técnico 2" });
  expect(second.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("textbox", { name: "Nome do técnico 1" }).getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByText("Cada técnico precisa de um nome só dele: “ana lucia” já está na lista.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Começar jogo" }).hasAttribute("disabled")).toBe(true);
  await userEvent.type(second, " Souza");
  expect(second.getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("button", { name: "Começar jogo" }).hasAttribute("disabled")).toBe(false);
});

test("with the market clock off a game starts without one", async () => {
  const { engine } = await openNewGame();
  await userEvent.click(screen.getByRole("radio", { name: "Sem" }));
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["marketClockSeconds"])).toEqual({ marketClockSeconds: undefined });
});

test("one coach starts on Realista's calendars, and a game with a second coach switches to Rápido", async () => {
  const { engine } = await openNewGame();
  expect(screen.getByRole("radio", { name: "Realista" })).toHaveProperty("checked", true);
  await userEvent.click(screen.getByRole("button", { name: "Mais um técnico" }));
  expect(screen.getByRole("radio", { name: "Rápido" })).toHaveProperty("checked", true);
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 1" }), "Ana");
  await userEvent.click(clubList().getByRole("button", { name: "Flamengo" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico 2" }), "Bruno");
  await userEvent.click(clubList().getByRole("button", { name: "Palmeiras" }));
  await userEvent.click(screen.getByRole("button", { name: "Começar jogo" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  expect(await engine.read(["formats"])).toEqual({ formats: { calendar: "unified", leagueLegs: 2, continentalGroups: "groups-3", knockouts: "late-two-legs" } });
});

test("Personalizar opens more options and starts the game with the coach's own mix", async () => {
  const { engine } = await openNewGame();
  await userEvent.click(screen.getByRole("radio", { name: "Personalizar" }));
  await userEvent.click(screen.getByRole("radio", { name: "1 turno" }));
  await userEvent.click(screen.getByRole("radio", { name: "Jogo único" }));
  await userEvent.click(clubList().getByRole("button", { name: "Bahia" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 10_000 });
  const { formats, calendar } = await engine.read(["formats", "calendar"]);
  expect(formats).toEqual({ calendar: "real", leagueLegs: 1, continentalGroups: "league-phase", knockouts: "single" });
  expect(calendar.leagueDates.A).toHaveLength(19);
});

test("a club abroad is picked from its league in the division filter and starts on the unified calendar", async () => {
  const { engine } = await openNewGame();
  await pickOption(screen.getByRole("combobox", { name: "Divisão" }), "Premier League · Inglaterra");
  await userEvent.click(clubList().getByRole("button", { name: "Arsenal FC" }));
  expect(screen.getByRole("radio", { name: "Realista" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("radio", { name: "Rápido" })).toHaveProperty("checked", true);
  await userEvent.type(screen.getByRole("textbox", { name: "Nome do técnico" }), "Rogério");
  await userEvent.click(screen.getByRole("button", { name: "Começar carreira" }));
  await screen.findByText("Clube aberto", {}, { timeout: 30_000 });
  const { coachClubId, formats, clubs } = await engine.read(["coachClubId", "formats", "clubs"]);
  expect(coachClubId).toBe("tm-11");
  expect(formats?.calendar).toBe("unified");
  expect(clubs["tm-11"]?.abroad).toEqual({ country: "gb-eng", level: 0 });
});
