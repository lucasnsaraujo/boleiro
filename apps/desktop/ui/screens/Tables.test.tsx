import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Tables } from "./Tables.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null = "bahia-ba"): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openTables(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/tables", element: <Tables /> },
      { path: "/round", element: <p>Rodada aberta</p> },
    ],
    { initialEntries: ["/tables"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("opens on the competition of the coach's next match, in his club's group", async () => {
  openTables(await services());
  expect((await screen.findByRole("tab", { name: "Baiano" })).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Série A" }).getAttribute("aria-selected")).toBe("false");
  const own = screen.getAllByRole("table").find((table) => within(table).queryByText("Bahia"));
  expect(own).toBeTruthy();
});

test("the Série A tab shows the whole table and its zones", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Série A" }));
  const table = screen.getByRole("table", { name: "Série A" });
  expect(within(table).getAllByRole("row")).toHaveLength(21);
  const zones = screen.getByRole("region", { name: "Vagas" });
  expect(within(zones).getByText("Libertadores")).toBeTruthy();
  expect(within(zones).getByText("Rebaixamento")).toBeTruthy();
});

test("the Copa do Brasil tab lists every round, with the drawn one's ties", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Copa do Brasil" }));
  const rounds = screen.getByRole("group", { name: "Fases" });
  expect(within(rounds).getByRole("button", { name: "1ª fase" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(rounds).getByRole("button", { name: "Final" })).toHaveProperty("disabled", true);
  expect(within(screen.getByRole("list", { name: "1ª fase" })).getAllByRole("listitem")).toHaveLength(14);
});

test("a state championship's knockout round is one click away", async () => {
  openTables(await services());
  await screen.findByRole("tab", { name: "Baiano" });
  const rounds = screen.getByRole("group", { name: "Fases" });
  expect(within(rounds).getByRole("button", { name: "Semifinal" })).toHaveProperty("disabled", true);
  await userEvent.click(within(rounds).getByRole("button", { name: "Grupos" }));
  expect(screen.getAllByRole("table").map((t) => t.getAttribute("aria-label"))).toEqual(["Grupo A", "Grupo B"]);
});

test("a coach without a club waits for offers from the tables instead of playing a round", async () => {
  openTables(await services(null));
  expect(await screen.findByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Jogar rodada" })).toBeNull();
});

test("every national division has a tab, next to the cup, CONMEBOL's cups and the club's state championship", async () => {
  openTables(await services());
  await screen.findByRole("tab", { name: "Baiano" });
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Série A",
    "Série B",
    "Série C",
    "Série D",
    "Copa do Brasil",
    "Libertadores",
    "Sul-Americana",
    "Baiano",
    "Outras ligas",
  ]);
});

test("a picked tab keeps the keyboard focus", async () => {
  openTables(await services());
  const tab = await screen.findByRole("tab", { name: "Série B" });
  await userEvent.click(tab);
  expect(screen.getByRole("tabpanel", { name: "Série B" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Série B" }));
});

test("the other state championships are one pick away under Outras ligas", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Outras ligas" }));
  expect(screen.getByRole("tab", { name: "Outras ligas" }).getAttribute("aria-selected")).toBe("true");
  const picker = screen.getByRole("combobox", { name: "Liga" });
  const names = within(picker).getAllByRole("option").map((option) => option.textContent);
  expect(names).not.toContain("Baiano");
  expect(names).toContain("Paulista");
  await userEvent.selectOptions(picker, "Paulista");
  expect(screen.getByRole("tabpanel", { name: "Paulista" })).toBeTruthy();
});

test("South America's leagues are one pick away under Outras ligas, Argentina with both its divisions", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Outras ligas" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Liga" }), "Argentina");
  const panel = screen.getByRole("tabpanel", { name: "Argentina" });
  const top = within(panel).getByRole("table", { name: "Liga Profesional" });
  expect(within(top).getAllByRole("row")).toHaveLength(31);
  expect(within(top).getByText("CA River Plate")).toBeTruthy();
  expect(within(panel).getByRole("table", { name: "Primera Nacional" })).toBeTruthy();
});

test("the Libertadores tab shows its first stage's ties between foreign clubs by name", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Libertadores" }));
  const ties = screen.getByRole("list", { name: "1ª fase" });
  expect(within(ties).getAllByRole("listitem")).toHaveLength(3);
  expect(within(ties).queryByText(/^tm-/)).toBeNull();
});

test("a table before its first round has no round to step through", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Série A" }));
  expect(screen.getByRole("table", { name: "Série A" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Rodada" })).toBeNull();
});

test("the round stepper shows the table as it stood after an earlier round", async () => {
  const given = await services();
  const { date, competitions } = await given.engine.read(["date", "competitions"]);
  const groups = competitions["state-ba-2026"]?.stages[0];
  const secondRound = groups?.kind === "groups" ? (groups.dates[1] ?? date) : date;
  const days = Math.round((Date.parse(secondRound) - Date.parse(date)) / 86_400_000) + 1;
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  openTables(given);

  const stepper = await screen.findByRole("group", { name: "Rodada" });
  const gamesPlayed = () => screen.getAllByRole("table").flatMap((table) => within(table).getAllByRole("row").slice(1).map((row) => Number(row.children[3]?.textContent)));
  expect(within(stepper).getByText("2ª rodada")).toBeTruthy();
  expect(Math.max(...gamesPlayed())).toBe(2);
  expect(within(stepper).getByRole("button", { name: "Próxima rodada" })).toHaveProperty("disabled", true);

  await userEvent.click(within(stepper).getByRole("button", { name: "Rodada anterior" }));
  expect(within(stepper).getByText("1ª rodada")).toBeTruthy();
  expect(Math.max(...gamesPlayed())).toBe(1);
  expect(within(stepper).getByRole("button", { name: "Rodada anterior" })).toHaveProperty("disabled", true);
});
