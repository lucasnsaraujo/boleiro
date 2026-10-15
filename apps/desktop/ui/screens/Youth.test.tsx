import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Youth } from "./Youth.js";

const CLUB = "flamengo-rj";
const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function startGame(coachClubId: string | null = CLUB): Promise<EngineClient> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId } });
  return engine;
}

function openYouth(engine: EngineClient) {
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter([{ path: "/youth", element: <Youth /> }], { initialEntries: ["/youth"] });
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

async function academyOf(engine: EngineClient) {
  const { youth } = await engine.read(["youth"]);
  return Object.values(youth?.prospects ?? {}).filter((p) => p.clubId === CLUB);
}

test("the academy lists its kids best first, with the scouts' stars, and the age tabs narrow it", async () => {
  const engine = await startGame();
  const kids = await academyOf(engine);
  openYouth(engine);
  const table = await screen.findByRole("table", { name: "Garotos da base" });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(kids.length);
  const strengths = rows.map((row) => Number(within(row).getAllByRole("cell")[3]?.textContent));
  expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
  expect(within(rows[0] as HTMLElement).getByRole("img", { name: /^Potencial de \d( a \d)? estrelas?$/ })).toBeTruthy();
  expect(screen.getByText(`16 a 20 anos · ${kids.length} garotos`)).toBeTruthy();

  await userEvent.setup().click(screen.getByRole("tab", { name: "Sub-17" }));
  const young = within(table).getAllByRole("row").slice(1);
  expect(young).toHaveLength(kids.filter((p) => p.age <= 17).length);
});

test("the 20-year-olds' banner says who turns 21, and picking a kid shows his card", async () => {
  const engine = await startGame();
  const kids = await academyOf(engine);
  const leaving = kids.filter((p) => p.age === 20).sort((a, b) => b.strength - a.strength)[0];
  if (!leaving) throw new Error("the academy has a 20-year-old");
  openYouth(engine);
  const banner = await screen.findByRole("region", { name: "Decisão da base" });
  expect(within(banner).getByText(`${leaving.name} faz 21 anos na virada do ano`)).toBeTruthy();
  await userEvent.setup().click(within(banner).getByRole("button", { name: "Ver garoto" }));
  const card = screen.getByRole("complementary", { name: `Garoto: ${leaving.name}` });
  expect(within(card).getByText(new RegExp(`${leaving.age} anos · ${leaving.hometown}$`))).toBeTruthy();
});

test("promoting the picked kid moves him from the academy into the squad", async () => {
  const engine = await startGame();
  openYouth(engine);
  const user = userEvent.setup();
  const card = await screen.findByRole("complementary", { name: /^Garoto: / });
  const name = card.getAttribute("aria-label")?.replace("Garoto: ", "") ?? "";
  await user.click(within(card).getByRole("button", { name: "Promover ao profissional" }));
  expect((await screen.findByRole("status")).textContent).toBe(`${name} subiu ao profissional.`);
  expect(within(screen.getByRole("table", { name: "Garotos da base" })).queryByText(name)).toBeNull();
  const { players } = await engine.read(["players"]);
  expect(Object.values(players).some((p) => p.clubId === CLUB && p.name === name && p.potential !== undefined)).toBe(true);
});

test("releasing asks for a second click, then the kid leaves the academy", async () => {
  const engine = await startGame();
  openYouth(engine);
  const user = userEvent.setup();
  const card = await screen.findByRole("complementary", { name: /^Garoto: / });
  const name = card.getAttribute("aria-label")?.replace("Garoto: ", "") ?? "";
  await user.click(within(card).getByRole("button", { name: "Dispensar" }));
  expect((await academyOf(engine)).some((p) => p.name === name)).toBe(true);
  await user.click(within(card).getByRole("button", { name: "Confirmar dispensa" }));
  expect((await screen.findByRole("status")).textContent).toBe(`${name} foi dispensado da base.`);
  expect((await academyOf(engine)).some((p) => p.name === name)).toBe(false);
});

test("a kid can be sold only inside a transfer window", async () => {
  openYouth(await startGame());
  const card = await screen.findByRole("complementary", { name: /^Garoto: / });
  expect(within(card).getByRole("button", { name: "Vender" }).hasAttribute("disabled")).toBe(true);
});

test("an age tab that hides the picked kid moves the card to its own best kid", async () => {
  const engine = await startGame();
  const kids = await academyOf(engine);
  const bestYoung = kids.filter((p) => p.age <= 17).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))[0];
  if (!bestYoung) throw new Error("the academy has a Sub-17 kid");
  openYouth(engine);
  const user = userEvent.setup();
  await screen.findByRole("complementary", { name: /^Garoto: / });
  await user.click(screen.getByRole("tab", { name: "Sub-17" }));
  expect(screen.getByRole("complementary", { name: `Garoto: ${bestYoung.name}` })).toBeTruthy();
});

test("selling the picked kid in the window names the buyer and the fee", async () => {
  const engine = await startGame();
  await engine.apply({ type: "advance", days: Array.from({ length: 4 }, () => ({})) });
  openYouth(engine);
  const user = userEvent.setup();
  const card = await screen.findByRole("complementary", { name: /^Garoto: / });
  await user.click(within(card).getByRole("button", { name: "Vender" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/ vendido ao .+ por R\$ /);
});

test("without a club there is no academy to show", async () => {
  openYouth(await startGame(null));
  expect(await screen.findByText("Sem clube, sem base.")).toBeTruthy();
});
