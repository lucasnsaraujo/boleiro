import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Tables } from "./Tables.js";

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

function openTables(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/tables", element: <Tables /> },
      { path: "/round", element: <p>Rodada aberta</p> },
    ],
    { initialEntries: ["/tables"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("opens on the competition of the coach's next match, in his club's group", async () => {
  openTables(await services());
  expect((await screen.findByRole("tab", { name: "Baiano" })).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Série A" }).getAttribute("aria-selected")).toBe("false");
  const own = screen.getAllByRole("table").find((table) => within(table).queryByText("Bahia"));
  expect(own).toBeTruthy();
});

test("the Série A tab shows the whole table and its zones", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Série A" }));
  const table = screen.getByRole("table", { name: "Série A" });
  expect(within(table).getAllByRole("row")).toHaveLength(21);
  expect(screen.getByText("Libertadores")).toBeTruthy();
  expect(screen.getByText("Rebaixamento")).toBeTruthy();
});

test("the Copa do Brasil tab lists every round, with the drawn one's ties", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Copa do Brasil" }));
  const rounds = screen.getByRole("group", { name: "Fases" });
  expect(within(rounds).getByRole("button", { name: "1ª fase" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(rounds).getByRole("button", { name: "Final" })).toHaveProperty("disabled", true);
  expect(within(screen.getByRole("list", { name: "1ª fase" })).getAllByRole("listitem")).toHaveLength(14);
});

test("a state championship's knockout round is one click away", async () => {
  openTables(await services());
  await screen.findByRole("tab", { name: "Baiano" });
  const rounds = screen.getByRole("group", { name: "Fases" });
  expect(within(rounds).getByRole("button", { name: "Semifinal" })).toHaveProperty("disabled", true);
  await userEvent.click(within(rounds).getByRole("button", { name: "Grupos" }));
  expect(screen.getAllByRole("table").map((t) => t.getAttribute("aria-label"))).toEqual(["Grupo A", "Grupo B"]);
});

test("a coach without a club waits for offers from the tables instead of playing a round", async () => {
  openTables(await services(null));
  expect(await screen.findByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Jogar rodada" })).toBeNull();
});
