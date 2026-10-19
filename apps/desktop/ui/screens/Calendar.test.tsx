import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Calendar } from "./Calendar.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null = "bahia-ba"): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openCalendar(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/calendar", element: <Calendar /> },
      { path: "/round", element: <p>Rodada aberta</p> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/calendar"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("the calendar opens on the current month with the coach's games and the window opening", async () => {
  openCalendar(await services());
  const month = await screen.findByRole("list", { name: "Janeiro" });
  expect(within(month).getAllByRole("listitem").some((row) => /Baiano/.test(row.textContent ?? ""))).toBe(true);
  expect(within(month).getByText("Abre a janela de transferências")).toBeTruthy();
});

test("picking another month shows that month's games", async () => {
  openCalendar(await services());
  await screen.findByRole("list", { name: "Janeiro" });
  await userEvent.click(screen.getByRole("button", { name: /^Outubro/ }));
  const rows = within(screen.getByRole("list", { name: "Outubro" })).getAllByRole("listitem");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => /Série A|Copa do Brasil/.test(row.textContent ?? ""))).toBe(true);
  expect(screen.queryByRole("list", { name: "Janeiro" })).toBeNull();
});

test("the arrows turn five weeks at a time, from the season's first page on", async () => {
  openCalendar(await services());
  expect(await screen.findByRole("heading", { level: 2, name: "Janeiro e fevereiro" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Semanas anteriores" }).hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Próximas semanas" }));
  expect(screen.getByRole("heading", { level: 2, name: "Fevereiro e março" })).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "Março" })).getByText("Fecha a janela de transferências")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Janeiro" })).toBeNull();
});

test("beside the page, the next game shows where it is played, and the three after it follow", async () => {
  openCalendar(await services());
  const next = await screen.findByRole("region", { name: /^Baiano · \dª rodada$/ });
  expect(within(next).getByText("Onde")).toBeTruthy();
  expect(within(next).getByText("Desfalques")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Em seguida" })).getAllByRole("listitem")).toHaveLength(3);
});

test("Jogar rodada from the calendar opens the live round on the match day", async () => {
  openCalendar(await services());
  await userEvent.click(await screen.findByRole("button", { name: "Jogar rodada" }));
  expect(await screen.findByText("Rodada aberta")).toBeTruthy();
});

test("a coach without a club waits for offers from the calendar instead of playing a round", async () => {
  openCalendar(await services(null));
  expect(await screen.findByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Jogar rodada" })).toBeNull();
});
