import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand, PlayResult } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { JobOffer } from "@boleiro/engine/sim/coach/coach";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Hub } from "./Hub.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null, change: (engine: EngineClient) => EngineClient = (engine) => engine): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine: change(engine), slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openHub(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/hub", element: <Hub /> },
      { path: "/round", element: <p>Rodada aberta</p> },
      { path: "/offers", element: <p>Propostas abertas</p> },
      { path: "/sacked", element: <p>Demissão aberta</p> },
      { path: "/season-end", element: <p>Fim de temporada aberto</p> },
      { path: "/", element: <p>Início</p> },
    ],
    { initialEntries: ["/hub"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

async function firstMatchOf(engine: EngineClient, clubId: string): Promise<string> {
  const { fixtures } = await engine.read(["fixtures"]);
  return fixtures.filter((f) => f.homeId === clubId || f.awayId === clubId).map((f) => f.date).sort()[0] ?? "";
}

test("the hub shows the club, its next opponent and the coach's job security", async () => {
  openHub(await services("bahia-ba"));
  expect(await screen.findByRole("heading", { name: "Bahia" })).toBeTruthy();
  const next = screen.getByRole("region", { name: "Próximo jogo" });
  expect(within(next).getAllByRole("img")).toHaveLength(2);
  expect(within(next).getByText(/^Baiano · \d+ª rodada$/)).toBeTruthy();
  expect(screen.getByText("Estável")).toBeTruthy();
});

test("Jogar rodada plays on to the first match day and opens the live round", async () => {
  const given = await services("bahia-ba");
  const firstMatch = await firstMatchOf(given.engine, "bahia-ba");
  openHub(given);
  await userEvent.click(await screen.findByRole("button", { name: "Jogar rodada" }));
  await screen.findByText("Rodada aberta");
  expect(await given.engine.read(["date"])).toEqual({ date: firstMatch });
});

test("when a day stops the coach early, the hub stays and shows the news that stopped it", async () => {
  const given = await services("bahia-ba", (engine) => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      if (command.type !== "playToMatchDay") return engine.apply(command);
      const played = await engine.apply({ type: "advance", days: [{}] });
      return { date: played.date, stop: "jobOffer", daysPlayed: 1 } satisfies PlayResult;
    }
    return {
      ...engine,
      apply,
      inbox: async () => [{ date: "2026-01-01", text: "Vitória faz proposta: R$ 250 mil por mês até 2026", tone: "good" }],
    };
  });
  openHub(given);
  await userEvent.click(await screen.findByRole("button", { name: "Jogar rodada" }));
  const inbox = await screen.findByRole("list", { name: "Notícias" });
  expect(await within(inbox).findByText("Vitória faz proposta: R$ 250 mil por mês até 2026")).toBeTruthy();
  expect(screen.queryByText("Rodada aberta")).toBeNull();
  expect(await screen.findByText(/2 de janeiro de 2026/)).toBeTruthy();
});

test("a coach without a club waits for offers instead of playing a round", async () => {
  openHub(await services(null));
  expect(await screen.findByRole("heading", { name: "Sem clube" })).toBeTruthy();
  expect(screen.getByText(/propostas? na mesa/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Próximo jogo" })).toBeNull();
});

test("with no game open the hub sends the coach back to the start", async () => {
  const given = await services("bahia-ba");
  given.game.current = null;
  openHub(given);
  expect(await screen.findByRole("heading", { name: "Nenhum jogo aberto" })).toBeTruthy();
});

test("a coach without a club opens the offers on the table from the hub", async () => {
  openHub(await services(null));
  await userEvent.click(await screen.findByRole("link", { name: "Ver propostas" }));
  expect(await screen.findByText("Propostas abertas")).toBeTruthy();
});

test("a coach with a club sees an offer on the table without leaving his round", async () => {
  const given = await services("bahia-ba");
  const save: { game: { coach: { offers: JobOffer[] } } } = JSON.parse(await given.engine.save());
  save.game.coach.offers.push({ clubId: "vitoria-ba", salary: 90_000, untilSeason: 2026, expiresOn: "2026-01-14" });
  await given.engine.apply({ type: "load", save: JSON.stringify(save) });
  openHub(given);
  expect(await screen.findByRole("link", { name: "1 proposta" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Jogar rodada" })).toBeTruthy();
});

test.each<[TurningPoint["kind"], string]>([
  ["fired", "Demissão aberta"],
  ["seasonEnd", "Fim de temporada aberto"],
])("a %s waiting sends the hub to its own screen", async (kind, opened) => {
  const point: TurningPoint =
    kind === "fired"
      ? { kind, firing: { type: "coachFired", clubId: "bahia-ba", date: "2026-06-10", isYou: true, position: 18, targetPosition: 10 } }
      : { kind, review: { season: 2026, clubId: null, placing: null, titles: [], continental: null, prizeMoney: 0, verdict: null, champions: {}, hasLostJob: false } };
  openHub(await services("bahia-ba", (engine) => ({ ...engine, turningPoint: async () => point })));
  expect(await screen.findByText(opened)).toBeTruthy();
});
