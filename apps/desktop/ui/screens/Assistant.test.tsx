import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Assistant } from "./Assistant.js";

const CLUB = "flamengo-rj";
const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function startGame(): Promise<EngineClient> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: CLUB } });
  return engine;
}

function openAssistant(engine: EngineClient) {
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter(
    [
      { path: "/assistant", element: <Assistant /> },
      { path: "/market", element: <p>Mercado</p> },
    ],
    { initialEntries: ["/assistant"] },
  );
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  return router;
}

test("the club's own level-1 assistant names the weakest starter and suggests signings who would join and fit the budget", async () => {
  const engine = await startGame();
  openAssistant(engine);
  const level = await screen.findByRole("meter", { name: "Nível do auxiliar" });
  expect(level.getAttribute("aria-valuenow")).toBe("1");
  expect(screen.getByText("Sem custo")).toBeTruthy();
  const { tip } = await engine.assistant();
  if (!tip) throw new Error("no tip for Flamengo");
  expect(screen.getByText(new RegExp(`é o mais fraco do time: ${tip.name}`))).toBeTruthy();
  const suggestions = screen.getByRole("list", { name: "Indicações do auxiliar" });
  expect(within(suggestions).getAllByRole("listitem").length).toBeGreaterThan(0);
  expect(within(suggestions).getAllByText(/Topa vir|Talvez/).length).toBe(within(suggestions).getAllByRole("listitem").length);
});

test("calling a better assistant the board can pay makes him the coach's, with his level and wage", async () => {
  const engine = await startGame();
  openAssistant(engine);
  const user = userEvent.setup();
  const [cheapest] = (await engine.assistant()).candidates;
  if (!cheapest) throw new Error("nobody to call");
  await user.click(await screen.findByRole("button", { name: `Chamar ${cheapest.name}` }));
  expect(await screen.findByRole("heading", { name: cheapest.name, level: 1 })).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Nível do auxiliar" }).getAttribute("aria-valuenow")).toBe(String(cheapest.level));
  expect((await engine.assistant()).assistant.name).toBe(cheapest.name);
});

test("switching the lineup off leaves the coach's last eleven, and the tips say so", async () => {
  const engine = await startGame();
  openAssistant(engine);
  const user = userEvent.setup();
  const lineup = await screen.findByRole("checkbox", { name: "Escalação" });
  expect(lineup).toHaveProperty("checked", true);
  await user.click(lineup);
  expect(await screen.findByText("o seu último time")).toBeTruthy();
  expect((await engine.assistant()).duties.lineup).toBe(false);
});

test("a suggestion's offer opens the market on that player", async () => {
  const engine = await startGame();
  const router = openAssistant(engine);
  const user = userEvent.setup();
  const suggestions = await screen.findByRole("list", { name: "Indicações do auxiliar" });
  const [offer] = within(suggestions).getAllByRole("link", { name: /^Fazer proposta por / });
  if (!offer) throw new Error("no suggestion");
  await user.click(offer);
  expect(router.state.location.pathname).toBe("/market");
  expect(router.state.location.search).toMatch(/^\?jogador=/);
});
