import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { doesAssistantHandle } from "@boleiro/engine/sim/coach/assistantDuties";
import { renewalSheet } from "@boleiro/game-client/market/contracts";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Shell } from "../app/Shell.js";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Hub } from "../screens/Hub.js";

const COACH = "bahia-ba";
const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const close of closers.splice(0)) close();
});

async function openHub(): Promise<EngineClient> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: COACH } });
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  render(
    <ServicesContext value={services}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={createMemoryRouter([{ element: <Shell />, children: [{ path: "/hub", element: <Hub /> }] }], { initialEntries: ["/hub"] })} />
      </SoundProvider>
    </ServicesContext>,
  );
  return engine;
}

/** Opens the Contratos tab and the renewal screen of its first player; his name. */
async function openFirstRenewal(): Promise<string> {
  await userEvent.click(await screen.findByRole("tab", { name: /Contratos/ }));
  const [first] = within(screen.getByRole("table", { name: "Contratos no último ano" })).getAllByRole("button", { name: /^Renovar com / });
  if (!first) throw new Error("no contract ends this season");
  const name = (first.getAttribute("aria-label") ?? "").replace("Renovar com ", "");
  await userEvent.click(first);
  await screen.findByRole("heading", { name: `Renovar com ${name}` });
  return name;
}

test("the squad page's Contratos tab lists the players in their last year with the assistant's plan", async () => {
  await openHub();
  await userEvent.click(await screen.findByRole("tab", { name: /Contratos/ }));
  const table = screen.getByRole("table", { name: "Contratos no último ano" });
  expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
  expect(within(table).getAllByText(/^Renova em 3 mar, |^Deixa acabar: /).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole("tab", { name: /Elenco/ }));
  expect(screen.getByRole("table", { name: "Elenco do Bahia" })).toBeTruthy();
});

test("on the renewal screen, a length and Renovar put the renewal at his ask on the board's desk", async () => {
  const engine = await openHub();
  const name = await openFirstRenewal();
  const { players, ...rest } = await engine.read(["date", "coachClubId", "coach", "clubs", "players", "finances", "market", "mood", "eventMemory", "hasMidSeasonWindow"]);
  const player = Object.values(players).find((p) => p.name === name && p.clubId === COACH);
  const ask = player && renewalSheet({ ...rest, players }, player.id)?.options.find((o) => o.months === 24)?.wage;
  await userEvent.click(screen.getByRole("radio", { name: /^2 anos: / }));
  await userEvent.click(screen.getByRole("button", { name: "Renovar por 2 anos" }));
  expect(await screen.findByText(/A diretoria responde amanhã\./)).toBeTruthy();
  expect((await engine.desk()).pending).toEqual([{ kind: "renew", playerId: player?.id, years: 2, wage: ask }]);
});

test("a length he won't talk about can't be picked", async () => {
  await openHub();
  await openFirstRenewal();
  for (const option of screen.getAllByRole("radio")) {
    if (option.getAttribute("aria-label")?.endsWith("Recusa")) expect(option).toHaveProperty("disabled", true);
  }
});

test("the assistant's switch on the renewal screen hands contracts back to the coach", async () => {
  const engine = await openHub();
  await openFirstRenewal();
  await userEvent.click(screen.getByRole("switch", { name: "O auxiliar cuida dos contratos" }));
  expect(await screen.findByText("Você cuida dos contratos")).toBeTruthy();
  expect(doesAssistantHandle((await engine.read(["coach"])).coach, "contracts")).toBe(false);
});

test("Escape closes the renewal screen", async () => {
  await openHub();
  const name = await openFirstRenewal();
  await userEvent.keyboard("{Escape}");
  // The sheet peels off before it goes.
  await waitFor(() => expect(screen.queryByRole("heading", { name: `Renovar com ${name}` })).toBeNull());
});
