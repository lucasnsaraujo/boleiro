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

async function services(coachClubId: string | null, seed = 7): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed, choices: { coachClubId, careerMode: coachClubId === null } });
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
  const given = await services("bahia-ba", 8);
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

test("the Raridades tab hides until the career finds an egg, then counts it out of every egg and keeps the rest as empty slots", async () => {
  const given = await services("bahia-ba");
  openHistory(given);
  await screen.findByRole("tab", { name: "Clube", selected: true });
  expect(screen.queryByRole("tab", { name: "Raridades" })).toBeNull();
  cleanup();

  await given.engine.apply({ type: "findEgg", eggId: "windows-98" });
  const { total } = await given.engine.eggAlbum();
  openHistory(given, "/history?aba=raridades");
  const panel = await screen.findByRole("tabpanel", { name: "Raridades" });
  expect(within(panel).getByLabelText(`1 de ${total}`)).toBeTruthy();
  expect(within(panel).getByRole("figure", { name: /Rodada de 1998, rara$/ })).toBeTruthy();
  expect(within(panel).getAllByRole("listitem")).toHaveLength(total);
  expect(within(panel).getAllByLabelText(/^Figurinha R\d\d, ainda escondida$/)).toHaveLength(total - 1);
});

/** Plays every day up to `date` with no decisions. */
async function playUntil(given: Services, date: string) {
  const { date: today } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
}

test("the album turns to last season's page of stickers, foil among them, and its title's page opens the final's ficha", async () => {
  // Palmeiras keeps its coach through a season that wins it the Paulista and the league.
  const given = await services("palmeiras-sp", 9);
  await playUntil(given, "2027-01-02");
  const album = await given.engine.album();
  const title = album.titles.find((t) => t.decider?.kind === "final");
  const decider = title?.decider;
  if (!title || !decider) return expect.fail("the coach won a final in 2026");
  const { clubs } = await given.engine.read(["clubs"]);
  openHistory(given);

  const years = await screen.findByRole("navigation", { name: "Temporadas" });
  await userEvent.click(within(years).getByRole("button", { name: /^2026/ }));
  const stickers = await screen.findByRole("list", { name: "Figurinhas de 2026" });
  expect(within(stickers).getAllByRole("link", { name: /, brilhante: / }).length).toBeGreaterThan(0);
  expect(within(stickers).getAllByRole("link", { name: /\d+ jogos? e \d+ gols?$/ }).length).toBeGreaterThan(10);

  await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${title.name} 2026, final: .*abrir a página do título$`) }));
  const page = await screen.findByRole("dialog", { name: title.name });
  const nameOf = (id: string) => clubs[id]?.shortName ?? id;
  const score = `${nameOf(decider.homeId)} ${decider.homeGoals} x ${decider.awayGoals} ${nameOf(decider.awayId)}`;
  expect(within(page).getByLabelText(score)).toBeTruthy();
  const goals = within(page).queryByRole("list", { name: "Gols" });
  expect(goals ? within(goals).getAllByRole("listitem").length : 0).toBe(decider.goals.length);
  await userEvent.click(within(page).getByRole("button", { name: "Ver ficha da final" }));
  const ficha = await screen.findByRole("dialog", { name: "Ficha do jogo" });
  expect(within(ficha).getByText("Encerrado")).toBeTruthy();
  expect(within(ficha).getByLabelText(score)).toBeTruthy();
});

test("each hot-seat coach opens his own album", async () => {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 3, choices: { coachClubId: "bahia-ba", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "vitoria-ba" }] } } });
  openHistory({ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Ana" } } });
  const seats = await screen.findByRole("group", { name: "Álbum de" });
  expect(screen.getByRole("heading", { name: "Bahia" })).toBeTruthy();
  await userEvent.click(within(seats).getByRole("button", { name: "Bruno" }));
  expect(await screen.findByRole("heading", { name: "Vitória" })).toBeTruthy();
  expect(within(seats).getByRole("button", { name: "Bruno", pressed: true })).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Carreira" })).toBeNull();
});
