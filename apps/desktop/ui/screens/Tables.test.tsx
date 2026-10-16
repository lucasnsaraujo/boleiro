import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Tables } from "./Tables.js";
import { optionNames, pickOption } from "../controls/pickOption.js";

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

test("every national division has a tab, next to the cup, CONMEBOL's cups, the Club World Cup and the club's state championship", async () => {
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
    "Mundial de Clubes",
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
  const names = await optionNames(picker);
  expect(names).not.toContain("Baiano");
  expect(names).toContain("Paulista");
  await pickOption(picker, "Paulista");
  expect(screen.getByRole("tabpanel", { name: "Paulista" })).toBeTruthy();
});

test("South America's leagues are one pick away under Outras ligas, Argentina with both its divisions", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Outras ligas" }));
  await pickOption(screen.getByRole("combobox", { name: "Liga" }), "Argentina");
  const panel = screen.getByRole("tabpanel", { name: "Argentina" });
  const top = within(panel).getByRole("table", { name: "Liga Profesional" });
  expect(within(top).getAllByRole("row")).toHaveLength(31);
  expect(within(top).getByText("CA River Plate")).toBeTruthy();
  expect(within(panel).getByRole("table", { name: "Primera Nacional" })).toBeTruthy();
});

test("Europe's leagues are one pick away under Outras ligas, England with both its divisions", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Outras ligas" }));
  await pickOption(screen.getByRole("combobox", { name: "Liga" }), "Inglaterra");
  const panel = screen.getByRole("tabpanel", { name: "Inglaterra" });
  const top = within(panel).getByRole("table", { name: "Premier League" });
  expect(within(top).getAllByRole("row")).toHaveLength(21);
  expect(within(top).getByText("Arsenal FC")).toBeTruthy();
  expect(within(panel).getByRole("table", { name: "Championship" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Vagas" })).getByText("Champions League")).toBeTruthy();
});

test("the Champions League is one pick away under Outras ligas, its league phase one table of 36 and its later stages waiting for their draw", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Outras ligas" }));
  await pickOption(screen.getByRole("combobox", { name: "Liga" }), "Champions League");
  const panel = screen.getByRole("tabpanel", { name: "Champions League" });
  const table = within(panel).getByRole("table", { name: "Fase de liga" });
  expect(within(table).getAllByRole("row")).toHaveLength(37);
  expect(within(table).getByText("Real Madrid")).toBeTruthy();
  expect((within(panel).getByRole("button", { name: "Mata-mata" }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(panel).getByText(/Paris Saint-Germain × Aston Villa/)).toBeTruthy();
});

test("the Libertadores tab shows its first stage's ties between foreign clubs by name", async () => {
  openTables(await services());
  await userEvent.click(await screen.findByRole("tab", { name: "Libertadores" }));
  const ties = screen.getByRole("list", { name: "1ª fase" });
  expect(within(ties).getAllByRole("listitem")).toHaveLength(3);
  expect(within(ties).queryByText(/^tm-/)).toBeNull();
});

test("from the round of 16 the Libertadores tab shows the whole bracket, a group table and the coach's next tie", async () => {
  const given = await services();
  const { date } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse("2026-08-12") - Date.parse(date)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  openTables(given);
  await userEvent.click(await screen.findByRole("tab", { name: "Libertadores" }));
  const stages = screen.getByRole("group", { name: "Fases" });
  expect(within(stages).getByRole("button", { name: "Oitavas" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("group", { name: "Libertadores, mata-mata" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Final" })).toBeTruthy();
  expect(screen.getByRole("table", { name: /^Grupo [A-H]$/ }).querySelectorAll("tbody tr")).toHaveLength(4);
  expect(screen.getByRole("region", { name: "Seu clube" })).toBeTruthy();
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

test("a played cup tie opens its last game's ficha", async () => {
  const given = await services();
  const { date } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse("2026-04-01") - Date.parse(date)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  openTables(given);
  await userEvent.click(await screen.findByRole("tab", { name: "Copa do Brasil" }));
  await userEvent.click(within(screen.getByRole("group", { name: "Fases" })).getByRole("button", { name: "1ª fase" }));
  const ties = screen.getByRole("list", { name: "1ª fase" });
  const [tie] = within(ties).getAllByRole("button", { name: /^Ficha do jogo: / });
  if (!tie) return expect.fail("the first round has been played");
  const [home, away] = (tie.getAttribute("aria-label") ?? "").replace("Ficha do jogo: ", "").split(" x ");
  await userEvent.click(tie);
  const panel = await screen.findByRole("dialog", { name: "Ficha do jogo" });
  expect(within(panel).getByText("Encerrado")).toBeTruthy();
  expect(within(panel).getByLabelText(new RegExp(`^${home} \\d+ x \\d+ ${away}$`))).toBeTruthy();
});

test("a played tie on the Libertadores bracket opens its last game's ficha", async () => {
  const given = await services();
  const { date } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse("2026-09-01") - Date.parse(date)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  openTables(given);
  await userEvent.click(await screen.findByRole("tab", { name: "Libertadores" }));
  const [tie] = within(screen.getByRole("group", { name: "Libertadores, mata-mata" })).getAllByRole("button", { name: /^Ficha do jogo: / });
  if (!tie) return expect.fail("the round of 16 has been played");
  const [home, away] = (tie.getAttribute("aria-label") ?? "").replace("Ficha do jogo: ", "").split(" x ");
  await userEvent.click(tie);
  const panel = await screen.findByRole("dialog", { name: "Ficha do jogo" });
  expect(within(panel).getByLabelText(new RegExp(`^${home} \\d+ x \\d+ ${away}$`))).toBeTruthy();
});

test("a Club World Cup semi-final on the bracket is one match, not a first leg", async () => {
  const given = await services("flamengo-rj");
  const { date } = await given.engine.read(["date"]);
  const days = Math.round((Date.parse("2026-07-10") - Date.parse(date)) / 86_400_000);
  await given.engine.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  openTables(given);
  await userEvent.click(await screen.findByRole("tab", { name: "Mundial de Clubes" }));
  await userEvent.click(within(screen.getByRole("group", { name: "Fases" })).getByRole("button", { name: "Final" }));
  const bracket = screen.getByRole("group", { name: "Mundial de Clubes, mata-mata" });
  expect(within(bracket).getAllByText(/^Jogo único/)).toHaveLength(2);
  expect(within(bracket).queryByText(/^Ida/)).toBeNull();
});
