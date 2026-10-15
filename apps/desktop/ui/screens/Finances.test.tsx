import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Finances } from "./Finances.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function startGame(): Promise<EngineClient> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "sport-pe" } });
  return engine;
}

function openFinances(engine: EngineClient) {
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter(
    [
      { path: "/finances", element: <Finances /> },
      { path: "/market", element: <p>Mercado aberto</p> },
    ],
    { initialEntries: ["/finances"] },
  );
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("before the first closing it says when the month closes", async () => {
  openFinances(await startGame());
  expect(await screen.findByText("O primeiro fechamento sai em 1 fev.")).toBeTruthy();
});

test("after a month the closing shows revenue against costs and the month's result", async () => {
  const engine = await startGame();
  await engine.apply({ type: "advance", days: Array.from({ length: 31 }, () => ({})) });
  const { finances } = await engine.read(["finances"]);
  const closing = finances["sport-pe"]?.lastClosing;
  if (!closing) throw new Error("no closing");
  openFinances(engine);
  const statement = await screen.findByRole("region", { name: "Fechamento de janeiro de 2026" });
  const sum = (lines: Record<string, number>) => Object.values(lines).reduce((total, amount) => total + amount, 0);
  expect(within(statement).getByText(formatMoney(sum(closing.ledger.revenue)))).toBeTruthy();
  expect(within(statement).getByText(formatMoney(sum(closing.ledger.costs)))).toBeTruthy();
  expect(within(statement).getByText(/^(Lucro|Prejuízo)$/)).toBeTruthy();
});

test("the board's answers are listed, and the primary action opens the market", async () => {
  const engine = await startGame();
  const { players } = await engine.read(["players"]);
  const own = Object.values(players).find((p) => p.clubId === "sport-pe");
  if (!own) throw new Error("no player");
  await engine.apply({ type: "ask", request: { kind: "renew", playerId: own.id, years: 2 } });
  await engine.apply({ type: "playToMatchDay" });
  openFinances(engine);
  const desk = await screen.findByRole("list", { name: "Pedidos à diretoria" });
  expect(within(desk).getByText(new RegExp(`^Renovação de ${own.name}: (aprovada|recusada)`))).toBeTruthy();
  await userEvent.click(screen.getByRole("link", { name: "Ir ao mercado" }));
  expect(await screen.findByText("Mercado aberto")).toBeTruthy();
});

test("the board and the fans show as meters from 0 to 100", async () => {
  openFinances(await startGame());
  const board = await screen.findByRole("meter", { name: "Diretoria" });
  expect(board.getAttribute("aria-valuenow")).toBe("50");
  expect(screen.getByRole("meter", { name: "Torcida" }).getAttribute("aria-valuenow")).toMatch(/^\d+$/);
});

test("a bank loan taken on the screen puts its money in the cash and shows what is left to pay", async () => {
  const engine = await startGame();
  openFinances(engine);
  const bank = await screen.findByRole("region", { name: "Empréstimo do banco" });
  await userEvent.click(within(bank).getByRole("button", { name: "Ver condições" }));
  await userEvent.click(within(bank).getByRole("radio", { name: "24x" }));
  await userEvent.click(within(bank).getByRole("button", { name: "Pegar empréstimo" }));
  await screen.findByRole("button", { name: "Quitar" });
  const running = screen.getByRole("region", { name: "Empréstimo do banco" });
  const { finances } = await engine.read(["finances"]);
  const loan = finances["sport-pe"]?.bankLoan;
  if (!loan) throw new Error("no loan taken");
  expect(within(running).getByText(/^24 parcelas de R\$/)).toBeTruthy();
  expect(running.textContent).toContain(`${formatMoney(loan.balance)}a pagar`);
});

test("a friendly booked on the screen is listed with its date and fee", async () => {
  openFinances(await startGame());
  const friendlies = await screen.findByRole("region", { name: "Amistosos" });
  await userEvent.click(within(friendlies).getByRole("button", { name: "Marcar amistoso" }));
  await userEvent.selectOptions(within(friendlies).getByRole("combobox", { name: "Adversário" }), "nautico-pe");
  await userEvent.click(within(friendlies).getByRole("button", { name: "Marcar" }));
  const booked = await within(friendlies).findByRole("list", { name: "Amistosos marcados" });
  expect(within(booked).getByText(/Náutico/)).toBeTruthy();
  expect(within(booked).getByText(/R\$/)).toBeTruthy();
});
