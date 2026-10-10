import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext } from "../app/ServicesContext.js";
import type { EngineClient } from "../engine/connectEngine.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { Player } from "./Player.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function openPlayerOf(clubId: string): Promise<{ engine: EngineClient; playerId: string }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.newGame(7, { coachClubId: "sport-pe" });
  const { players } = await engine.read(["players"]);
  const player = Object.values(players).find((p) => p.clubId === clubId && p.age > 21);
  if (!player) throw new Error(`no player at ${clubId}`);
  const router = createMemoryRouter([{ path: "/squad/:playerId", element: <Player /> }], { initialEntries: [`/squad/${player.id}`] });
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return { engine, playerId: player.id };
}

test("Renovar asks the board for the years chosen and says when it answers", async () => {
  const { engine, playerId } = await openPlayerOf("sport-pe");
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Anos" }), "3");
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
