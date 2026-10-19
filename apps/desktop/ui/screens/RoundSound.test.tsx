import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand } from "@boleiro/game-client/engine/createEngineSession";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { FakeAudioContext, fetchUrlBytes } from "../sound/fakeAudioContext.js";
import { CROWD_BED, SAMPLES } from "../sound/soundCatalog.js";
import { createSoundEngine } from "../sound/soundEngine.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Round } from "./Round.js";

const closers: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const close of closers.splice(0)) close();
});

async function onMatchDay(change: (engine: EngineClient) => EngineClient = (engine) => engine): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 6, choices: { coachClubId: "bahia-ba" } });
  await engine.apply({ type: "playToMatchDay" });
  return { engine: change(engine), slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

/** A session whose coach's match has only a goal of the coach's side at `minute` that VAR awards after the flag went up. */
function withVarGoalAt(minute: number) {
  return (engine: EngineClient): EngineClient => {
    const rewrite = <R extends LiveRound | null>(round: R): R => {
      const fixtureId = round?.coach?.fixtureId;
      if (!round || !fixtureId) return round;
      const awarded: MatchEvent[] = [
        { type: "varCheck", minute, clubId: "bahia-ba", playerId: "p9", decision: "goalAwarded", seconds: 60 },
        { type: "goal", minute, clubId: "bahia-ba", playerId: "p9" },
      ];
      const isWhistle = (e: MatchEvent) => !("clubId" in e);
      return { ...round, matches: round.matches.map((m) => (m.fixtureId === fixtureId ? { ...m, events: [...awarded, ...m.events.filter(isWhistle)] } : m)) };
    };
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      const result = await engine.apply(command);
      return command.type === "startRound" ? rewrite(result as CommandResults["startRound"]) : result;
    }
    return { ...engine, apply, liveRound: async () => rewrite(await engine.liveRound()) };
  };
}

function openRoundWithSound(given: Services) {
  const contexts: FakeAudioContext[] = [];
  const sound = createSoundEngine({
    createContext: () => {
      const ctx = new FakeAudioContext();
      contexts.push(ctx);
      return ctx;
    },
    fetchBytes: fetchUrlBytes,
  });
  const router = createMemoryRouter([{ path: "/round", element: <Round /> }], { initialEntries: ["/round"] });
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={sound} store={localStorage}>
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
  return () => {
    const ctx = contexts[0];
    if (!ctx) throw new Error("the first click made no audio context");
    return ctx;
  };
}

const shownMinute = () => Number(screen.getByLabelText("Minuto").textContent?.replace("'", ""));
const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** Opens the round with sound, kicks off, and returns a way to play match minutes at 1x with the audio clock keeping time. */
async function kickOffWithSound(given: Services | Promise<Services> = onMatchDay()) {
  given = await given;
  const ctx = openRoundWithSound(given);
  const sheet = await screen.findByRole("dialog", { name: "Escalação" });
  await userEvent.click(within(sheet).getByRole("button", { name: "Começar a rodada" }));
  await screen.findByRole("region", { name: "Seu jogo" });
  await settle();
  const play = (minutes: number) => {
    for (let i = 0; i < minutes; i++) {
      ctx().currentTime += 0.66;
      act(() => vi.advanceTimersByTime(660));
    }
  };
  return { given, ctx, play };
}

test("the round whistles the kick-off, half-time and full time, and roars or boos the coach's goals", async () => {
  const { given, ctx, play } = await kickOffWithSound();
  const round = await given.engine.liveRound();
  play(1);
  await settle();
  expect(ctx().started()).toContain(SAMPLES.whistleShort);

  for (let restarts = 0; shownMinute() < 90 && restarts < 30; restarts++) {
    await user().click(screen.getByRole("button", { name: "1x" }));
    play(90 - shownMinute());
  }
  expect(shownMinute()).toBe(90);

  const ours = round?.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const goals = ours?.events.filter((e) => e.type === "goal") ?? [];
  expect(goals.length).toBeGreaterThan(0);
  const started = ctx().started();
  expect(started).toContain(SAMPLES.whistleLong);
  expect(started.includes(SAMPLES.goalRoar)).toBe(goals.some((g) => g.clubId === "bahia-ba"));
  expect(started.includes(SAMPLES.boo)).toBe(goals.some((g) => g.clubId !== "bahia-ba"));
});

test("the crowd fills the round and goes when the coach leaves the screen", async () => {
  const { ctx, play } = await kickOffWithSound();
  play(5);
  await settle();
  expect(ctx().playing()).toContain(CROWD_BED);
  cleanup();
  ctx().currentTime += 5;
  expect(ctx().playing()).not.toContain(CROWD_BED);
});

test("a goal VAR awards sounds only with the decision: first the check's sting, then the whistle, the roar and the stinger", async () => {
  const MINUTE = 6;
  const { ctx, play } = await kickOffWithSound(onMatchDay(withVarGoalAt(MINUTE)));
  play(MINUTE);
  await screen.findByText("VAR checando o gol");
  const sting = ctx().notes();
  expect(ctx().started()).not.toContain(SAMPLES.goalRoar);

  await screen.findByText("Gol validado", undefined, { timeout: 5_000 });
  expect(ctx().started()).toContain(SAMPLES.goalRoar);
  expect(ctx().started().filter((url) => url === SAMPLES.whistleShort).length).toBeGreaterThan(1);
  expect(ctx().notes()).toBeGreaterThan(sting + 8);
}, 30_000);
