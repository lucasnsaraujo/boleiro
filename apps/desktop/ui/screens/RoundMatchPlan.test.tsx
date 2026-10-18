import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MatchPlan } from "@boleiro/engine/sim/coach/matchPlan";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand, NewGameChoices } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
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

const CLUB = "bahia-ba";

async function onMatchDay(plan: MatchPlan, choices: Partial<NewGameChoices> = {}, change: (engine: EngineClient) => EngineClient = (engine) => engine): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 18, choices: { coachClubId: CLUB, ...choices } });
  await engine.apply({ type: "playToMatchDay" });
  await engine.apply({ type: "setMatchPlan", plan });
  return { engine: change(engine), slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

async function kickOff(given: Services) {
  const router = createMemoryRouter(
    [
      { path: "/round", element: <Round /> },
      { path: "/hub", element: <p>Clube aberto</p> },
    ],
    { initialEntries: ["/round"] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Escalação" })).getByRole("button", { name: "Começar a rodada" }));
  await screen.findByRole("region", { name: "Seu jogo" });
}

const shownMinute = () => Number(screen.getByLabelText("Minuto").textContent?.replace("'", ""));
const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
function play(minutes: number) {
  act(() => vi.advanceTimersByTime(minutes * 660));
}

test("the coach's tactics key puts his next saved tactics on at the minute on the clock, and the clock keeps running", async () => {
  const saved = { formation: "3-5-2" as const, posture: "attacking" as const, penaltyTakerId: null };
  const given = await onMatchDay({ tacticsKey: "q", savedTactics: [saved] });
  await kickOff(given);
  play(3);
  await user().keyboard("q");
  await waitFor(async () => expect((await given.engine.liveRound())?.coach?.tactics).toMatchObject({ formation: "3-5-2", posture: "attacking" }));
  expect(await screen.findByText("Tática 1")).toBeTruthy();
  const minute = shownMinute();
  play(3);
  expect(shownMinute()).toBeGreaterThan(minute);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the coach's time-out key stops the round and opens his own match", async () => {
  const given = await onMatchDay({ timeOutKey: "p" });
  await kickOff(given);
  play(2);
  await user().keyboard("p");
  expect(await screen.findByRole("dialog", { name: "Escalação" })).toBeTruthy();
  const minute = shownMinute();
  play(10);
  expect(shownMinute()).toBe(minute);
});

test("under the house rule a league match is the plan's: no lineup, and the time-out key only says why", async () => {
  const given = await onMatchDay({ timeOutKey: "p" }, { manualChangesOnlyInFinals: true });
  await kickOff(given);
  expect(screen.queryByRole("button", { name: /^Escalação/ })).toBeNull();
  await user().click(screen.getByRole("button", { name: /Só o plano/ }));
  expect(screen.getByText("Regra da casa")).toBeTruthy();
  await user().keyboard("p");
  expect(screen.queryByRole("dialog")).toBeNull();
  const minute = shownMinute();
  play(3);
  expect(shownMinute()).toBeGreaterThan(minute);
});

/** The coach's match made to end level with a shootout, and every kicker order the round sends kept instead of applied. */
function withShootout(sent: (readonly string[])[]) {
  return (engine: EngineClient): EngineClient => {
    const levelled = (round: CommandResults["startRound"]): CommandResults["startRound"] => {
      const coach = round.coach;
      if (!coach) throw new Error("the coach has a match");
      const shootout: MatchEvent = { type: "shootoutKick", minute: 90, clubId: CLUB, playerId: coach.starters[1] ?? "", isScored: true };
      const level = (e: MatchEvent) => e.type !== "goal" && e.type !== "injury" && !(e.type === "card" && e.card !== "yellow") && e.type !== "varCheck";
      return { ...round, matches: round.matches.map((m) => (m.fixtureId === coach.fixtureId ? { ...m, events: [...m.events.filter(level), shootout] } : m)) };
    };
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      if (command.type === "changeLive" && command.change.kickerOrder) {
        sent.push(command.change.kickerOrder);
        const live = await engine.liveRound();
        return live && levelled(live);
      }
      const result = await engine.apply(command);
      return command.type === "startRound" ? levelled(result as CommandResults["startRound"]) : result;
    }
    return { ...engine, apply };
  };
}

test("when his plan asks, the round stops at his level final whistle for his shootout order, and ends once he gives it", async () => {
  const sent: (readonly string[])[] = [];
  const given = await onMatchDay({ asksBeforeShootout: true }, {}, withShootout(sent));
  await kickOff(given);
  await user().click(screen.getByRole("button", { name: "4x" }));
  for (let step = 0; step < 30 && !screen.queryByRole("dialog", { name: "Pênaltis" }); step++) play(5);
  const window = await screen.findByRole("dialog", { name: "Pênaltis" });
  const kickers = within(within(window).getByRole("list", { name: "Ordem das cobranças" })).getAllByRole("listitem").filter((li) => li.querySelector("button"));
  expect(kickers.length).toBeGreaterThanOrEqual(10);
  const second = kickers[1]?.querySelector(".so-nm")?.textContent ?? "";
  const names = new Map((await given.engine.liveRound())?.coach?.squad.map((p) => [p.id, p.name]) ?? []);
  await user().click(within(window).getByRole("button", { name: `Subir ${second}` }));
  await user().click(within(window).getByRole("button", { name: "Confirmar ordem" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(names.get(sent[0]?.[0] ?? "")).toBe(second);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pênaltis" })).toBeNull());
});

test("without asking, the round never stops for the shootout order", async () => {
  const sent: (readonly string[])[] = [];
  const given = await onMatchDay({}, {}, withShootout(sent));
  await kickOff(given);
  await user().click(screen.getByRole("button", { name: "4x" }));
  for (let step = 0; step < 30; step++) play(5);
  expect(screen.queryByRole("dialog", { name: "Pênaltis" })).toBeNull();
  expect(sent).toEqual([]);
});
