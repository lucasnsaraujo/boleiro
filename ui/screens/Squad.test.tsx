import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { Player } from "./Player.js";
import { Squad } from "./Squad.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null = "bahia-ba"): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.newGame(7, { coachClubId });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function open(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/squad", element: <Squad /> },
      { path: "/squad/:playerId", element: <Player /> },
    ],
    { initialEntries: ["/squad"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

const ages = (group: HTMLElement) =>
  within(group)
    .getAllByRole("row")
    .flatMap((row) => {
      const cells = within(row).queryAllByRole("cell");
      return cells.length > 0 ? [Number(cells[2]?.textContent)] : [];
    });

test("the squad is grouped by position, keepers first", async () => {
  open(await services());
  await screen.findByRole("heading", { name: "Elenco" });
  const groups = screen.getAllByRole("rowgroup").slice(1);
  expect(groups.map((g) => within(g).getByRole("rowheader").textContent)).toEqual(["Goleiros", "Defensores", "Meio-campistas", "Atacantes"]);
});

test("clicking a column sorts each group by it, and clicking again flips it", async () => {
  open(await services());
  await screen.findByRole("heading", { name: "Elenco" });
  const age = screen.getByRole("columnheader", { name: "Idade" });
  expect(age.getAttribute("aria-sort")).toBe("none");
  await userEvent.click(within(age).getByRole("button"));
  expect(age.getAttribute("aria-sort")).toBe("ascending");
  const defenders = screen.getAllByRole("rowgroup")[2];
  if (!defenders) throw new Error("no defenders");
  expect(ages(defenders)).toEqual(ages(defenders).toSorted((a, b) => a - b));
  await userEvent.click(within(age).getByRole("button"));
  expect(age.getAttribute("aria-sort")).toBe("descending");
  expect(ages(defenders)).toEqual(ages(defenders).toSorted((a, b) => b - a));
});

test("a player's name opens his screen, where the market actions wait for the market", async () => {
  open(await services());
  await screen.findByRole("heading", { name: "Elenco" });
  const [first] = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/squad/"));
  if (!first) throw new Error("no player link");
  const name = first.textContent ?? "";
  await userEvent.click(first);
  expect(await screen.findByRole("heading", { name })).toBeTruthy();
  for (const action of ["Renovar", "Vender", "Emprestar"]) expect(screen.getByRole("button", { name: action })).toHaveProperty("disabled", true);
  await userEvent.click(screen.getByRole("link", { name: "Voltar ao elenco" }));
  expect(await screen.findByRole("heading", { name: "Elenco" })).toBeTruthy();
});

test("a new game's player screen lists his strength for this season", async () => {
  open(await services());
  await screen.findByRole("heading", { name: "Elenco" });
  const [first] = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/squad/"));
  if (!first) throw new Error("no player link");
  await userEvent.click(first);
  const history = (await screen.findByRole("heading", { name: "Força por temporada" })).closest("section");
  if (!history) throw new Error("no strength history");
  const strength = screen.getByLabelText(/^Força \d+$/).getAttribute("aria-label")?.replace("Força ", "");
  expect(within(history).getAllByRole("listitem").map((item) => item.textContent)).toEqual([`2026${strength}`]);
});

test("a coach without a club has no squad", async () => {
  open(await services(null));
  expect(await screen.findByText("Sem clube, sem elenco.")).toBeTruthy();
});
