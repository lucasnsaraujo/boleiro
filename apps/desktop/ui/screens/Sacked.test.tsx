import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { CUES } from "../sound/soundCatalog.js";
import type { SoundEngine } from "../sound/soundEngine.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Sacked } from "./Sacked.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

const firing: TurningPoint = {
  kind: "fired",
  firing: { type: "coachFired", clubId: "bahia-ba", date: "2026-06-10", isYou: true, position: 18, targetPosition: 10 },
};

async function services(points: TurningPoint[]): Promise<{ given: Services; closed: () => number }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  let closedCount = 0;
  const queue = [...points];
  function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
  async function apply(command: GameCommand): Promise<unknown> {
    if (command.type !== "closeTurningPoint") return engine.apply(command);
    queue.shift();
    closedCount++;
  }
  const faked: EngineClient = { ...engine, turningPoint: async () => queue[0] ?? null, apply };
  return { given: { engine: faked, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }, closed: () => closedCount };
}

function openSacked(given: Services, sound?: SoundEngine) {
  const router = createMemoryRouter(
    [
      { path: "/sacked", element: <Sacked /> },
      { path: "/offers", element: <p>Propostas abertas</p> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/sacked"] },
  );
  const screenTree = <RouterProvider router={router} />;
  render(<ServicesContext value={given}>{sound ? <SoundProvider engine={sound} store={localStorage}>{screenTree}</SoundProvider> : screenTree}</ServicesContext>);
}

test("the sacking shows where the club stood against the board's target, then opens the offers", async () => {
  const { given, closed } = await services([firing]);
  openSacked(given);
  expect(await screen.findByRole("heading", { name: "Demitido" })).toBeTruthy();
  expect(screen.getByText("18º")).toBeTruthy();
  expect(screen.getByText("10º")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Ver propostas" }));
  await screen.findByText("Propostas abertas");
  expect(closed()).toBe(1);
});

test("with no sacking waiting the screen sends the coach to his club", async () => {
  const { given } = await services([]);
  openSacked(given);
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
});

test("the sacking plays its stinger", async () => {
  const sound = unlockedFakeSound();
  const { given } = await services([firing]);
  openSacked(given, sound.engine);
  await screen.findByRole("heading", { name: "Demitido" });
  expect(sound.ctx.notes()).toBe(CUES.sacked.tones.length);
});
