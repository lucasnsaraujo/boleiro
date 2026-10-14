import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Market } from "./Market.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function openMarket(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "sport-pe" } });
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter([{ path: "/market", element: <Market /> }], { initialEntries: ["/market"] });
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return services;
}

test("the closed window is shown with the day it opens", async () => {
  await openMarket();
  expect(await screen.findByText("Janela fechada · abre 5 jan")).toBeTruthy();
});

test("filtering by position lists only players of that position", async () => {
  await openMarket();
  const results = await screen.findByRole("table", { name: "Jogadores" });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Posição" }), "Goleiro");
  const positions = within(results).getAllByRole("cell", { name: /^(GOL|DEF|MEI|ATA)$/ }).map((cell) => cell.textContent);
  expect(new Set(positions)).toEqual(new Set(["GOL"]));
});

test("asking to buy a player puts the request on the board's desk until the window opens, and it can be withdrawn", async () => {
  const { engine } = await openMarket();
  const results = await screen.findByRole("table", { name: "Jogadores" });
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Divisão" }), "Série A");
  // A player with a fee: under contract past this season, neither on loan nor in his last six months.
  const priced = within(results).getAllByRole("row").find((row) => within(row).queryByRole("cell", { name: /^R\$/ }));
  const first = priced && within(priced).getByRole("button");
  if (!first) throw new Error("no player listed with a fee");
  const name = first.textContent ?? "";
  await userEvent.click(first);

  const chosen = screen.getByRole("region", { name });
  await userEvent.click(within(chosen).getByRole("button", { name: "Comprar" }));
  const desk = screen.getByRole("list", { name: "Pedidos à diretoria" });
  expect(within(desk).getByText(`Contratação de ${name}`)).toBeTruthy();
  expect(within(desk).getByText("Fica na mesa até a janela abrir, em 5 jan.")).toBeTruthy();
  expect((await engine.desk()).pending).toHaveLength(1);

  await userEvent.click(within(desk).getByRole("button", { name: "Retirar" }));
  expect(screen.getByText("Nenhum pedido à diretoria.")).toBeTruthy();
  expect((await engine.desk()).pending).toEqual([]);
});
