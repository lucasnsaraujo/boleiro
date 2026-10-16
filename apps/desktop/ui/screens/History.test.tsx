import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { History } from "./History.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openHistory(given: Services, entry = "/history") {
  const router = createMemoryRouter(
    [
      { path: "/history", element: <History /> },
      { path: "/offers", element: <p>Propostas abertas</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("the history opens on the coach's club", async () => {
  openHistory(await services("bahia-ba"));
  expect(await screen.findByRole("tab", { name: "Clube", selected: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Bahia" })).toBeTruthy();
});

test("a career coach with offers on the table goes from his career to the offers", async () => {
  openHistory(await services(null), "/history?aba=carreira");
  expect(await screen.findByRole("tab", { name: "Carreira", selected: true })).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Clube" })).toBeNull();
  await userEvent.click(screen.getByRole("link", { name: "Ver propostas" }));
  expect(await screen.findByText("Propostas abertas")).toBeTruthy();
});

test("a record win of this season opens its match's ficha", async () => {
  const given = await services("bahia-ba");
  const { date } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse("2026-04-15") - Date.parse(date)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  const { history, clubs } = await given.engine.read(["history", "clubs"]);
  const win = history.clubs["bahia-ba"]?.biggestWin;
  if (!win) return expect.fail("Bahia has won a match by mid-April");
  const opponent = clubs[win.opponentId]?.shortName ?? "";
  const score = win.home ? `Bahia ${win.goalsFor} x ${win.goalsAgainst} ${opponent}` : `${opponent} ${win.goalsAgainst} x ${win.goalsFor} Bahia`;
  openHistory(given);
  await userEvent.click(await screen.findByRole("button", { name: /^Maior vitória: .*, ficha do jogo$/ }));
  const panel = await screen.findByRole("dialog", { name: "Ficha do jogo" });
  expect(within(panel).getByText("Encerrado")).toBeTruthy();
  expect(within(panel).getByLabelText(score)).toBeTruthy();
});
