import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Awards } from "./Awards.js";

// Each test plays part of a season in the worker before it opens the screen.
const PLAYS_A_SEASON_MS = 60_000;
const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(until: string | null): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  if (until) {
    const { date } = await engine.read(["date"]);
    const days = Math.round((Date.parse(until) - Date.parse(date)) / 86_400_000);
    await engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  }
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openAwards(given: Services) {
  const router = createMemoryRouter([{ path: "/awards", element: <Awards /> }], { initialEntries: ["/awards"] });
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("mid-season the awards show the provisional Bola de Ouro and the Bola de Prata team of eleven", async () => {
  const given = await services("2026-08-01");
  openAwards(given);
  const book = await given.engine.awards();
  const gold = book.provisional?.awards.bolaDeOuro;
  if (!gold) throw new Error("no provisional Bola de Ouro");
  expect(await screen.findByRole("heading", { name: "Prêmios 2026" })).toBeTruthy();
  expect(screen.getByText(/^Parcial · após \d+ rodadas$/)).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Bola de Ouro" })).getByRole("heading", { name: gold.name })).toBeTruthy();
  const team = screen.getByRole("list", { name: "Bola de Prata" });
  expect(within(team).getAllByRole("listitem", { name: /, (goleiro|lateral|zagueiro|meia|atacante), / })).toHaveLength(11);
  expect(screen.getByRole("listitem", { name: /^Ballon d'Or: / })).toBeTruthy();
}, PLAYS_A_SEASON_MS);

test("before the Brasileirão kicks off the awards page waits for its first round", async () => {
  openAwards(await services(null));
  expect(await screen.findByText(/Os prêmios do Brasileirão saem a partir da primeira rodada/)).toBeTruthy();
}, PLAYS_A_SEASON_MS);

test("the records tab shows the Brasileirão's records and the coach's club's leaders", async () => {
  openAwards(await services("2026-06-01"));
  await userEvent.click(await screen.findByRole("tab", { name: "Recordes" }));
  expect(screen.getByRole("heading", { name: "Brasileirão" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Bahia" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Mais jogos" })).getAllByRole("listitem")).toHaveLength(5);
}, PLAYS_A_SEASON_MS);

test("the seasons tab lists the season under way as partial and opens it", async () => {
  openAwards(await services("2026-06-01"));
  await userEvent.click(await screen.findByRole("tab", { name: "Temporadas" }));
  const table = screen.getByRole("table", { name: "Prêmios por temporada" });
  expect(within(table).getByText("parcial")).toBeTruthy();
  await userEvent.click(within(table).getByRole("button", { name: "Ver os prêmios de 2026" }));
  expect(screen.getByRole("tab", { name: "Prêmios", selected: true })).toBeTruthy();
}, PLAYS_A_SEASON_MS);
