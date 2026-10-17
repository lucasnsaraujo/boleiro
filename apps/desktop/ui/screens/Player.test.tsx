import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Player } from "./Player.js";
import { pickOption } from "../controls/pickOption.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function openPlayerOf(clubId: string, from: string[] = [], prepare: (engine: EngineClient) => Promise<unknown> = async () => undefined): Promise<{ engine: EngineClient; playerId: string }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "sport-pe" } });
  await prepare(engine);
  const { players } = await engine.read(["players"]);
  const player = Object.values(players).find((p) => p.clubId === clubId && p.age > 21);
  if (!player) throw new Error(`no player at ${clubId}`);
  const router = createMemoryRouter(
    [
      { path: "/squad/:playerId", element: <Player /> },
      { path: "/squad", element: <p>Elenco aberto</p> },
      { path: "/tables", element: <p>Tabelas abertas</p> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: [...from, `/squad/${player.id}`] },
  );
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return { engine, playerId: player.id };
}

test("Renovar asks the board for the years chosen and says when it answers", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  await pickOption(await screen.findByRole("combobox", { name: "Anos" }), "3");
  await userEvent.click(screen.getByRole("button", { name: "Renovar" }));
  expect(await screen.findByText(/Renovação de .+ na mesa\. A diretoria responde amanhã\./)).toBeTruthy();
  expect((await engine.desk()).pending).toEqual([{ kind: "renew", playerId, years: 3 }]);
});

test("Vender waits for the window, and the request can be withdrawn", async () => {
  const { engine } = await openPlayerOf("sport-pe");
  await userEvent.click(await screen.findByRole("button", { name: "Vender" }));
  expect(await screen.findByText(/Fica na mesa até a janela abrir, em 5 jan\./)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Retirar" }));
  expect(await screen.findByRole("button", { name: "Vender" })).toBeTruthy();
  expect((await engine.desk()).pending).toEqual([]);
});

test("another club's player has no contract actions here", async () => {
  await openPlayerOf("palmeiras-sp");
  await screen.findByText("Contrato");
  expect(screen.queryByRole("button", { name: "Renovar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Vender" })).toBeNull();
});

test("Voltar goes back to the screen the player was opened from", async () => {
  await openPlayerOf("palmeiras-sp", ["/tables"]);
  await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
  expect(await screen.findByText("Tabelas abertas")).toBeTruthy();
});

test("a player opened with no screen behind him goes back to the squad", async () => {
  await openPlayerOf("sport-pe");
  await userEvent.click(await screen.findByRole("button", { name: "Voltar" }));
  expect(await screen.findByText("Elenco aberto")).toBeTruthy();
});

test("another club's player can be watched from his page", async () => {
  const { engine, playerId } = await openPlayerOf("palmeiras-sp");
  await userEvent.click(await screen.findByRole("button", { name: "Observar" }));
  expect(await screen.findByRole("button", { name: "Observando" })).toBeTruthy();
  expect((await engine.scouting()).watchList).toEqual([playerId]);
});

type SavedLoans = { game: { players: Record<string, { clubId: string }>; market: { loans: Record<string, unknown> } } };

test("a player the coach lent out can be called back from his page", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  const save: SavedLoans = JSON.parse(await engine.save());
  const lent = save.game.players[playerId];
  if (!lent) throw new Error("no lent player");
  lent.clubId = "vitoria-ba";
  save.game.market.loans[playerId] = { fromClubId: "sport-pe", until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
  await engine.apply({ type: "load", save: JSON.stringify(save) });
  cleanup();
  const router = createMemoryRouter([{ path: "/squad/:playerId", element: <Player /> }], { initialEntries: [`/squad/${playerId}`] });
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Chamar de volta" }));
  expect((await engine.desk()).pending).toEqual([{ kind: "recall", playerId }]);
});

test("the coach retires one of his players after a confirm, and he leaves the squad", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  const { players } = await engine.read(["players"]);
  const name = players[playerId]?.name ?? "";
  await userEvent.click(await screen.findByRole("button", { name: `Aposentar ${name}` }));
  const confirm = screen.getByRole("alertdialog", { name: `Aposentar ${name} agora? Ele deixa o elenco e não volta.` });
  await userEvent.click(within(confirm).getByRole("button", { name: "Aposentar" }));
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
  expect((await engine.read(["players"])).players[playerId]).toBeUndefined();
});

test("the confirm to retire a player takes the focus, and Escape puts it away", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  const name = (await engine.read(["players"])).players[playerId]?.name ?? "";
  const retire = await screen.findByRole("button", { name: `Aposentar ${name}` });
  await userEvent.click(retire);
  const confirm = screen.getByRole("alertdialog", { name: `Aposentar ${name} agora? Ele deixa o elenco e não volta.` });
  expect(confirm.contains(document.activeElement)).toBe(true);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(retire);
});

test("during a live round a player can't be retired, and the page says why", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe", [], async (engine) => {
    await engine.apply({ type: "playToMatchDay" });
    await engine.apply({ type: "startRound" });
  });
  const name = (await engine.read(["players"])).players[playerId]?.name ?? "";
  expect(await screen.findByText("Com a rodada em andamento, isso fica para depois do apito final.")).toBeTruthy();
  expect(screen.getByRole("button", { name: `Aposentar ${name}` })).toHaveProperty("disabled", true);
});

test("a veteran who announced his last season can be asked once to play one more year", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  const saved = JSON.parse(await engine.save()) as { game: { players: Record<string, object> } };
  saved.game.players[playerId] = { ...saved.game.players[playerId], retiring: { afterSeason: 2026, hasBeenAsked: false } };
  await engine.apply({ type: "load", save: JSON.stringify(saved) });
  cleanup();
  const router = createMemoryRouter([{ path: "/squad/:playerId", element: <Player /> }], { initialEntries: [`/squad/${playerId}`] });
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  expect(await screen.findByText(/anunciou que 2026 será sua última temporada\.$/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Pedir mais um ano" }));
  const { players } = await engine.read(["players"]);
  const answer = players[playerId]?.retiring;
  if (answer) expect(await screen.findByText(/Você pediu mais um ano e ele não mudou de ideia\./)).toBeTruthy();
  else expect(await screen.findByText(/aceitou jogar mais um ano\./)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Pedir mais um ano" })).toBeNull();
});
