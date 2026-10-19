import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext } from "../app/ServicesContext.js";
import { Club } from "./Club.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function openClub(clubId: string) {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "sport-pe" } });
  const { players } = await engine.read(["players"]);
  const router = createMemoryRouter(
    [
      { path: "/club/:clubId", element: <Club /> },
      { path: "/squad/:playerId", element: <p>Ficha aberta</p> },
      { path: "/market", element: <p>Busca aberta</p> },
    ],
    { initialEntries: ["/market", `/club/${clubId}`], initialIndex: 1 },
  );
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return { router, squad: Object.values(players).filter((p) => p.clubId === clubId) };
}

test("a club's page shows its name, division and its whole squad", async () => {
  const { squad } = await openClub("palmeiras-sp");
  expect(await screen.findByRole("heading", { name: "Palmeiras" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Palmeiras" }).textContent).toContain("Série A · SP");
  const table = screen.getByRole("table", { name: "Elenco do Palmeiras" });
  const links = within(table).getAllByRole("link").map((link) => link.textContent);
  expect(links.toSorted()).toEqual(squad.map((p) => p.name).toSorted());
});

test("a player's name opens his page, where the coach negotiates", async () => {
  const { router, squad } = await openClub("palmeiras-sp");
  const strongest = squad.toSorted((a, b) => b.strength - a.strength)[0];
  if (!strongest) throw new Error("Palmeiras needs players");
  const table = await screen.findByRole("table", { name: "Elenco do Palmeiras" });
  await userEvent.click(within(table).getByRole("link", { name: strongest.name }));
  expect(await screen.findByText("Ficha aberta")).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/squad/${strongest.id}`);
});

test("Voltar goes back to the screen that opened the club", async () => {
  await openClub("palmeiras-sp");
  await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
  expect(await screen.findByText("Busca aberta")).toBeTruthy();
});

test("a club the game doesn't know says so", async () => {
  await openClub("nobody-xx");
  expect(await screen.findByText("Clube não encontrado.")).toBeTruthy();
});
