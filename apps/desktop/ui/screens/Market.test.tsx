import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Market } from "./Market.js";
import { pickOption } from "../controls/pickOption.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

type SavedSquads = { game: { coachClubId: string; players: Record<string, { id: string; clubId: string }> } };

/** Tops the coach's squad up to `size` with copies of one of his players, through a save loaded back. */
async function fillSquadTo(engine: EngineClient, size: number): Promise<void> {
  const save: SavedSquads = JSON.parse(await engine.save());
  const { coachClubId, players } = save.game;
  const squad = Object.values(players).filter((p) => p.clubId === coachClubId);
  for (let i = squad.length; i < size; i++) players[`filler-${i}`] = { ...squad[0], id: `filler-${i}`, clubId: coachClubId };
  await engine.apply({ type: "load", save: JSON.stringify(save) });
}

type SavedFinances = { game: { coachClubId: string; finances: Record<string, { transferBudget: number }> } };

/** Sets the coach's transfer budget, through a save loaded back. */
async function setTransferBudget(engine: EngineClient, transferBudget: number): Promise<void> {
  const save: SavedFinances = JSON.parse(await engine.save());
  const finance = save.game.finances[save.game.coachClubId];
  if (!finance) throw new Error("the coach's club has no finances");
  finance.transferBudget = transferBudget;
  await engine.apply({ type: "load", save: JSON.stringify(save) });
}

async function openMarket(coachClubId = "sport-pe", squadSize?: number, transferBudget?: number): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId } });
  if (squadSize !== undefined) await fillSquadTo(engine, squadSize);
  if (transferBudget !== undefined) await setTransferBudget(engine, transferBudget);
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
  await pickOption(screen.getByRole("combobox", { name: "Posição" }), "Goleiro");
  const positions = within(results).getAllByRole("cell", { name: /^(GOL|DEF|MEI|ATA)$/ }).map((cell) => cell.textContent);
  expect(new Set(positions)).toEqual(new Set(["GOL"]));
});

test("asking to buy a player puts the request on the board's desk until the window opens, and it can be withdrawn", async () => {
  const { engine } = await openMarket();
  const results = await screen.findByRole("table", { name: "Jogadores" });
  await pickOption(screen.getByRole("combobox", { name: "Liga" }), "Série A");
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

/** The first listed player whose club asks a fee, picked in the list. */
async function pickPricedPlayer(): Promise<string> {
  const results = await screen.findByRole("table", { name: "Jogadores" });
  await pickOption(screen.getByRole("combobox", { name: "Liga" }), "Série B");
  const priced = within(results).getAllByRole("row").find((row) => within(row).queryByRole("cell", { name: /^R\$/ }));
  const button = priced && within(priced).getByRole("button");
  if (!button) throw new Error("no player listed with a fee");
  await userEvent.click(button);
  return button.textContent ?? "";
}

test("an offer under the club's price is a proposal, sent with the fee the coach set", async () => {
  const { engine } = await openMarket();
  const name = await pickPricedPlayer();
  const chosen = screen.getByRole("region", { name });
  await userEvent.click(within(chosen).getByRole("button", { name: "Diminuir oferta" }));
  await userEvent.click(within(chosen).getByRole("button", { name: "Fazer proposta" }));
  const [request] = (await engine.desk()).pending;
  expect(request).toMatchObject({ kind: "sign" });
  expect(request?.kind === "sign" && request.fee).toBeGreaterThan(0);
  expect((await engine.read(["players"])).players[request?.playerId ?? ""]?.name).toBe(name);
});

test("a squad at the 50-player cap is told why the board won't sign anyone", async () => {
  await openMarket("sao-paulo-sp", 50);
  expect(await screen.findByLabelText("Elenco 50 de 50")).toBeTruthy();
  const name = await pickPricedPlayer();
  expect(within(screen.getByRole("region", { name })).getByText("Elenco cheio: 50 de 50 jogadores. Venda ou empreste alguém antes de contratar.")).toBeTruthy();
});

test("the Propostas tab shows the offers for the coach's own players and his players for sale", async () => {
  await openMarket();
  await userEvent.click(await screen.findByRole("tab", { name: "Propostas" }));
  expect(await screen.findByRole("heading", { name: "Nenhuma proposta na mesa" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "À venda" })).toBeTruthy();
});

test("paying a player's release clause puts that request on the board's desk", async () => {
  const { engine } = await openMarket("flamengo-rj");
  const name = await pickPricedPlayer();
  const chosen = screen.getByRole("region", { name });
  const pay = within(chosen).getByRole("button", { name: /^Pagar a multa: R\$/ });
  await userEvent.click(pay);
  expect(within(screen.getByRole("list", { name: "Pedidos à diretoria" })).getByText(`Multa rescisória de ${name}`)).toBeTruthy();
  expect((await engine.desk()).pending).toMatchObject([{ kind: "payClause" }]);
});

test("a release clause over the transfer budget can't be paid, and the screen says why", async () => {
  await openMarket("sport-pe", undefined, 0);
  const name = await pickPricedPlayer();
  const chosen = screen.getByRole("region", { name });
  expect(within(chosen).getByRole("button", { name: /^Pagar a multa: R\$/ })).toHaveProperty("disabled", true);
  expect(within(chosen).getByText(/^A multa não cabe na verba/)).toBeTruthy();
});

test("a starred player is on the watch list, and the watched-only switch lists just him", async () => {
  const { engine } = await openMarket();
  const name = await pickPricedPlayer();
  await userEvent.click(within(screen.getByRole("region", { name })).getByRole("button", { name: "Observar" }));
  expect(await within(screen.getByRole("region", { name })).findByRole("button", { name: "Observando" })).toBeTruthy();
  expect((await engine.scouting()).watchList).toHaveLength(1);
  await userEvent.click(screen.getByRole("switch", { name: "Só observados" }));
  const rows = within(screen.getByRole("table", { name: "Jogadores" })).getAllByRole("row").slice(1);
  expect(rows.map((row) => within(row).getAllByRole("button")[0]?.textContent)).toEqual([name]);
});

test("a search saved under a name comes back from the saved searches", async () => {
  const { engine } = await openMarket();
  await screen.findByRole("table", { name: "Jogadores" });
  await pickOption(screen.getByRole("combobox", { name: "Posição" }), "Goleiro");
  await userEvent.click(screen.getByRole("button", { name: "Salvar busca" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Nome da busca" }), "Goleiros{Enter}");
  expect((await engine.scouting()).savedFilters).toMatchObject([{ name: "Goleiros", filters: { group: "GK" } }]);
  await pickOption(screen.getByRole("combobox", { name: "Posição" }), "Todas");
  await pickOption(await screen.findByRole("combobox", { name: "Buscas salvas" }), "Goleiros");
  const positions = within(screen.getByRole("table", { name: "Jogadores" })).getAllByRole("cell", { name: /^(GOL|DEF|MEI|ATA)$/ }).map((cell) => cell.textContent);
  expect(new Set(positions)).toEqual(new Set(["GOL"]));
});

test("the offer's contract length sets the wage he asks for it, and both go with the request", async () => {
  const { engine } = await openMarket();
  const name = await pickPricedPlayer();
  const chosen = screen.getByRole("region", { name });
  const lengths = within(chosen).getByRole("radiogroup", { name: "Tempo de contrato" });
  const two = within(lengths).getByRole("radio", { name: /^2 anos: / });
  await userEvent.click(two);
  expect(two.getAttribute("aria-checked")).toBe("true");
  const asked = /^2 anos: (R\$ [^ ]+(?: mi| mil)?) por mês/.exec(two.getAttribute("aria-label") ?? "")?.[1];
  expect(within(chosen).getByRole("group", { name: "Salário" }).querySelector("output")?.textContent).toBe(asked);
  await userEvent.click(within(chosen).getByRole("button", { name: "Comprar" }));
  expect((await engine.desk()).pending).toMatchObject([{ kind: "sign", years: 2 }]);
});

test("a contract length he won't talk about can't be offered", async () => {
  await openMarket();
  const name = await pickPricedPlayer();
  const lengths = within(screen.getByRole("region", { name })).getByRole("radiogroup", { name: "Tempo de contrato" });
  for (const option of within(lengths).getAllByRole("radio")) {
    if (option.getAttribute("aria-label")?.endsWith("Recusa")) expect(option).toHaveProperty("disabled", true);
  }
});
