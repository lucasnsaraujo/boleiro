import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "../engine/connectEngine.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import type { TurningPoint } from "../hub/turningPoints.js";
import { indexedDbSlots } from "../saves/indexedDbSlots.js";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { CUES } from "../sound/soundCatalog.js";
import type { SoundEngine } from "../sound/soundEngine.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import type { SeasonReview } from "../seasonEnd/seasonReview.js";
import { SeasonEnd } from "./SeasonEnd.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

const promoted: SeasonReview = {
  season: 2026,
  clubId: "bahia-ba",
  placing: { division: "B", position: 3, tableSize: 20, move: "promoted" },
  titles: ["state-ba"],
  continental: null,
  prizeMoney: 2_500_000,
  verdict: {
    expectation: "promotion",
    targetPosition: 4,
    position: 3,
    hasMetTarget: true,
    contract: { kind: "renewed", untilSeason: 2027 },
    reputationBefore: 30,
    reputationAfter: 41,
  },
  champions: { "serie-a": "flamengo-rj", "copa-do-brasil": "palmeiras-sp", "state-ba": "bahia-ba" },
  hasLostJob: false,
};

const withoutClub: SeasonReview = { ...promoted, clubId: null, placing: null, titles: [], prizeMoney: 0, verdict: null };

async function services(points: TurningPoint[]): Promise<{ given: Services; closed: () => number }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  let closedCount = 0;
  const queue = [...points];
  const faked: EngineClient = {
    ...engine,
    turningPoint: async () => queue[0] ?? null,
    closeTurningPoint: async () => {
      queue.shift();
      closedCount++;
    },
  };
  return { given: { engine: faked, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }, closed: () => closedCount };
}

function openSeasonEnd(given: Services, sound?: SoundEngine) {
  const router = createMemoryRouter(
    [
      { path: "/season-end", element: <SeasonEnd /> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/season-end"] },
  );
  const screenTree = <RouterProvider router={router} />;
  render(<ServicesContext value={given}>{sound ? <SoundProvider engine={sound} store={localStorage}>{screenTree}</SoundProvider> : screenTree}</ServicesContext>);
}

test("the season's result comes first, then the board's verdict, then the next season starts", async () => {
  const { given, closed } = await services([{ kind: "seasonEnd", review: promoted }]);
  openSeasonEnd(given);
  expect(await screen.findByText("Acesso")).toBeTruthy();
  expect(screen.getByText("Sobe para a Série A")).toBeTruthy();
  expect(screen.getByText("Baiano")).toBeTruthy();
  expect(screen.queryByText("Meta cumprida")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Ver a diretoria" }));
  expect(await screen.findByText("Meta cumprida")).toBeTruthy();
  expect(screen.getByText("Renovado até 2027")).toBeTruthy();
  expect(closed()).toBe(0);

  await userEvent.click(screen.getByRole("button", { name: "Começar 2027" }));
  await screen.findByText("Clube aberto");
  expect(closed()).toBe(1);
});

test("a coach without a club sees the season's champions and starts the next one straight away", async () => {
  const { given, closed } = await services([{ kind: "seasonEnd", review: withoutClub }]);
  openSeasonEnd(given);
  expect(await screen.findByText("Flamengo")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ver a diretoria" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Começar 2027" }));
  await screen.findByText("Clube aberto");
  expect(closed()).toBe(1);
});

test("a coach whose contract ended without a board review is told he has no club", async () => {
  const { given } = await services([{ kind: "seasonEnd", review: { ...promoted, verdict: null, hasLostJob: true } }]);
  openSeasonEnd(given);
  expect(await screen.findByText("Encerrado, você está sem clube")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Começar 2027" })).toBeTruthy();
});

test("with no season end waiting the screen sends the coach to his club", async () => {
  const { given } = await services([]);
  openSeasonEnd(given);
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
});

test("a promotion plays its stinger, and a season seen without a club plays none", async () => {
  const promotion = unlockedFakeSound();
  const { given } = await services([{ kind: "seasonEnd", review: promoted }]);
  openSeasonEnd(given, promotion.engine);
  await screen.findByText("Acesso");
  expect(promotion.ctx.notes()).toBe(CUES.promotion.tones.length);
  cleanup();

  const champions = unlockedFakeSound();
  const other = await services([{ kind: "seasonEnd", review: withoutClub }]);
  openSeasonEnd(other.given, champions.engine);
  await screen.findByText("Flamengo");
  expect(champions.ctx.notes()).toBe(0);
});
