import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import type { JobOffer } from "@boleiro/engine/sim/coach/coach";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { writeSessionSave } from "@boleiro/game-client/engine/sessionSave";
import { EMPTY_DESK } from "@boleiro/game-client/market/boardDesk";
import { Offers } from "./Offers.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function careerGame(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: null, careerMode: true } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openOffers(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/offers", element: <Offers /> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/offers"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

async function offeredNames(given: Services): Promise<string[]> {
  const { coach, clubs } = await given.engine.read(["coach", "clubs"]);
  return coach.offers.map((offer) => clubs[offer.clubId]?.shortName ?? offer.clubId);
}

test("signing with the picked club makes the coach its manager and opens the club", async () => {
  const given = await careerGame();
  const [, second] = await offeredNames(given);
  openOffers(given);
  const list = await screen.findByRole("list", { name: "Propostas" });
  await userEvent.click(within(list).getByRole("button", { name: new RegExp(second ?? "") }));
  await userEvent.click(screen.getByRole("button", { name: `Assinar com ${second}` }));
  await screen.findByText("Clube aberto");
  const { coachClubId, clubs } = await given.engine.read(["coachClubId", "clubs"]);
  expect(clubs[coachClubId ?? ""]?.shortName).toBe(second);
});

test("turning an offer down takes it off the list and leaves the coach without a club", async () => {
  const given = await careerGame();
  const [first, ...rest] = await offeredNames(given);
  openOffers(given);
  const list = await screen.findByRole("list", { name: "Propostas" });
  expect(within(list).getAllByRole("button")).toHaveLength(rest.length + 1);
  await userEvent.click(within(list).getByRole("button", { name: new RegExp(first ?? "") }));
  await userEvent.click(screen.getByRole("button", { name: `Recusar ${first}` }));
  expect(await offeredNames(given)).toEqual(rest);
  await screen.findByRole("button", { name: `Assinar com ${rest[0]}` });
  expect(within(list).queryByRole("button", { name: new RegExp(first ?? "") })).toBeNull();
  expect((await given.engine.read(["coachClubId"])).coachClubId).toBeNull();
});

test("on his match day a coach with a club can only sign after the game", async () => {
  const given = await careerGame();
  await given.engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await given.engine.apply({ type: "playToMatchDay" });
  const save: { game: { coach: { offers: JobOffer[] } } } = JSON.parse(await given.engine.save());
  save.game.coach.offers.push({ clubId: "vitoria-ba", salary: 90_000, untilSeason: 2026, expiresOn: "2026-12-31" });
  await given.engine.apply({ type: "load", save: JSON.stringify(save) });
  await given.engine.apply({ type: "startRound" });
  openOffers(given);
  expect(await screen.findByText("Assine depois do jogo.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Assinar com Vitória" })).toHaveProperty("disabled", true);
  expect(await given.engine.liveRound()).not.toBeNull();
});

test("during a live round the coach can only turn an offer down after the game", async () => {
  const given = await careerGame();
  await given.engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await given.engine.apply({ type: "playToMatchDay" });
  const save: { game: { coach: { offers: JobOffer[] } } } = JSON.parse(await given.engine.save());
  save.game.coach.offers.push({ clubId: "vitoria-ba", salary: 90_000, untilSeason: 2026, expiresOn: "2026-12-31" });
  await given.engine.apply({ type: "load", save: JSON.stringify(save) });
  await given.engine.apply({ type: "startRound" });
  openOffers(given);
  expect(await screen.findByText("Assine depois do jogo.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recusar Vitória" })).toHaveProperty("disabled", true);
});

test("with every offer turned down the coach can only wait for new ones", async () => {
  const given = await careerGame();
  const { coach } = await given.engine.read(["coach"]);
  for (const offer of coach.offers) await given.engine.apply({ type: "declineOffer", clubId: offer.clubId });
  openOffers(given);
  expect(await screen.findByText("Nenhuma proposta na mesa.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Assinar/ })).toBeNull();
});

test("an offer from a club abroad shows its league, and signing takes the coach there", async () => {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  const game = newGameFromFiles(5, { coachClubId: "flamengo-rj" }, bundledGameFiles);
  const offer: JobOffer = { clubId: "tm-11", salary: 900_000, untilSeason: 2026, expiresOn: "2026-01-14" };
  await engine.apply({ type: "load", save: writeSessionSave({ game: { ...game, coach: { ...game.coach, offers: [offer] } }, desk: EMPTY_DESK, turningPoints: [], live: null }) });
  const given = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  openOffers(given);
  const list = await screen.findByRole("list", { name: "Propostas" });
  const line = within(list).getByRole("button", { name: /Arsenal/ });
  expect(line.textContent).toContain("Premier League");
  await userEvent.click(line);
  await userEvent.click(screen.getByRole("button", { name: /^Assinar com Arsenal/ }));
  await screen.findByText("Clube aberto", {}, { timeout: 30_000 });
  const { coachClubId, clubs } = await engine.read(["coachClubId", "clubs"]);
  expect(coachClubId).toBe("tm-11");
  expect(clubs["tm-11"]?.abroad).toEqual({ country: "gb-eng", level: 0 });
}, 60_000);
