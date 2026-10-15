import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Stadium } from "./Stadium.js";

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

function openStadium(engine: EngineClient) {
  const services: Services = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter([{ path: "/stadium", element: <Stadium /> }], { initialEntries: ["/stadium"] });
  render(
    <ServicesContext value={services}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("the stadium names the ground, its seats and the club it shares them with", async () => {
  openStadium(await startGame());
  expect(await screen.findByRole("heading", { name: "Estádio Jornalista Mário Filho" })).toBeTruthy();
  expect(screen.getByText(/dividido com o Fluminense/).textContent).toMatch(/^[\d.]+ lugares · dividido com o Fluminense$/);
});

test("the assistant prices tickets until the coach takes over; a dearer ticket forecasts fewer fans, applied it is the club's price", async () => {
  const engine = await startGame();
  openStadium(engine);
  const user = userEvent.setup();
  const assistant = await screen.findByRole("switch", { name: /Auxiliar define o preço/ });
  expect(assistant.getAttribute("aria-checked")).toBe("true");
  const raise = screen.getByRole("button", { name: "Subir o preço" });
  expect(raise.hasAttribute("disabled")).toBe(true);

  const crowdAt = () => Number(screen.getByTestId("std-crowd").textContent?.replaceAll(".", ""));
  const usual = crowdAt();
  await user.click(assistant);
  for (let press = 0; press < 10; press++) await user.click(raise);
  expect(crowdAt()).toBeLessThan(usual);
  await user.click(screen.getByRole("button", { name: "Aplicar preço" }));
  const { finances, economy } = await engine.read(["finances", "economy"]);
  expect(finances[CLUB]?.ticketPrice).toBe(economy.matchday.A.price + 50);
});

test("the board answers a request for new seats on the spot, and approved the works start", async () => {
  const engine = await startGame("palmeiras-sp");
  openStadium(engine);
  const user = userEvent.setup();
  const works = await screen.findByRole("region", { name: "Pedir obra à diretoria" });
  await user.click(within(works).getByRole("radio", { name: /\+2\.000 lugares/ }));
  await user.click(within(works).getByRole("button", { name: "Enviar pedido" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/^Diretoria aprovou/);
  expect(screen.getByRole("heading", { name: "Obra em andamento" })).toBeTruthy();
  const { finances } = await engine.read(["finances"]);
  expect(finances["palmeiras-sp"]?.stadiumWorks?.seats).toBe(2_000);
});

test("the board turns down works on a ground the club shares, and says why", async () => {
  openStadium(await startGame());
  const user = userEvent.setup();
  const works = await screen.findByRole("region", { name: "Pedir obra à diretoria" });
  await user.click(within(works).getByRole("button", { name: "Enviar pedido" }));
  expect((await screen.findByRole("status")).textContent).toBe("Diretoria recusou: o estádio não é só do clube, a obra não é com ela.");
  await user.click(within(works).getByRole("radio", { name: /\+5\.000 lugares/ }));
  expect(screen.queryByRole("status")).toBeNull();
});

test("without a club there is no stadium", async () => {
  openStadium(await startGame(null));
  expect(await screen.findByText("Sem clube, sem estádio.")).toBeTruthy();
});
