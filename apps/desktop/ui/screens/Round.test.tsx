import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { Round } from "./Round.js";

const closers: (() => void)[] = [];

beforeEach(() => {
  // Only the match clock is faked; the engine's messages and testing-library's waits keep real time.
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
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await engine.apply({ type: "playToMatchDay" });
  return { engine: change(engine), slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openRound(given: Services) {
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
}

const lineup = () => screen.findByRole("dialog", { name: "Escalação" });
const shownMinute = () => Number(screen.getByLabelText("Minuto").textContent?.replace("'", ""));
const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

async function kickOff(given: Services) {
  openRound(given);
  await userEvent.click(within(await lineup()).getByRole("button", { name: "Começar a rodada" }));
  await screen.findByRole("region", { name: "Seu jogo" });
}

/** Lets the clock run for `minutes` match minutes at 1x, or until the round stops by itself. */
function play(minutes: number) {
  act(() => vi.advanceTimersByTime(minutes * 660));
}

test("on the match day the lineup opens with the coach's last tactics, and confirming it kicks off the round", async () => {
  const given = await onMatchDay();
  const { coach } = await given.engine.read(["coach"]);
  openRound(given);
  const sheet = await lineup();
  expect(within(sheet).getByRole("button", { name: coach.tactics.formation })).toHaveProperty("ariaPressed", "true");
  expect(within(sheet).getByRole("group", { name: "Titulares" }).querySelectorAll("button")).toHaveLength(11);
  await userEvent.click(within(sheet).getByRole("button", { name: "Começar a rodada" }));
  expect(await screen.findByRole("region", { name: "Seu jogo" })).toBeTruthy();
  expect(shownMinute()).toBe(0);
  expect(await given.engine.liveRound()).not.toBeNull();
});

test("the round can't kick off without exactly one goalkeeper, and injured or suspended players can't come in", async () => {
  const given = await onMatchDay((engine) => ({
    ...engine,
    matchDayPlan: async () => {
      const plan = await engine.matchDayPlan();
      const bench = plan.squad.filter((p) => !plan.lineup.includes(p.id) && p.group !== "GK");
      const [hurt, banned] = bench;
      return { ...plan, squad: plan.squad.map((p) => (p === hurt ? { ...p, status: "injured" as const } : p === banned ? { ...p, status: "suspended" as const } : p)) };
    },
  }));
  const plan = await given.engine.matchDayPlan();
  const keeper = plan.squad.find((p) => plan.lineup.includes(p.id) && p.group === "GK");
  const unavailable = plan.squad.filter((p) => p.status !== null);
  const fit = plan.squad.find((p) => !plan.lineup.includes(p.id) && p.group !== "GK" && p.status === null);
  if (!keeper || !fit || unavailable.length !== 2) throw new Error("the plan has a keeper, a fit outfielder and two unavailable players on the bench");

  openRound(given);
  const sheet = await lineup();
  await userEvent.click(within(sheet).getByRole("button", { name: keeper.name }));
  const bench = within(sheet).getByRole("list", { name: "Banco" });
  for (const p of unavailable) expect(within(bench).getByRole("button", { name: p.name })).toHaveProperty("disabled", true);
  await userEvent.click(within(bench).getByRole("button", { name: fit.name }));
  expect(within(sheet).getByRole("status").textContent).toBe("Escale um goleiro.");
  expect(within(sheet).getByRole("button", { name: "Começar a rodada" })).toHaveProperty("disabled", true);

  await userEvent.click(within(sheet).getByRole("button", { name: "Desfazer" }));
  expect(within(sheet).getByRole("button", { name: "Começar a rodada" })).toHaveProperty("disabled", false);
});

test("opening the lineup pauses the round, and going back resumes it", async () => {
  const given = await onMatchDay();
  await kickOff(given);
  play(3);
  const before = shownMinute();
  expect(before).toBeGreaterThan(0);

  await user().click(screen.getByRole("button", { name: /^Escalação/ }));
  await lineup();
  play(20);
  expect(shownMinute()).toBe(before);
  expect(screen.getByRole("button", { name: "Pausar" })).toHaveProperty("ariaPressed", "true");

  await user().click(screen.getByRole("button", { name: "Voltar ao jogo" }));
  play(2);
  expect(shownMinute()).toBeGreaterThan(before);
});

test("closing the full table of a paused round leaves it paused", async () => {
  const given = await onMatchDay();
  await kickOff(given);
  play(3);
  await user().click(screen.getByRole("button", { name: "Pausar" }));
  const paused = shownMinute();
  await user().click(screen.getByRole("button", { name: "Tabela completa" }));
  await user().click(await screen.findByRole("button", { name: "Fechar" }));
  play(10);
  expect(shownMinute()).toBe(paused);
});

test("the full table and the lineup take focus while open and give it back to their buttons", async () => {
  const given = await onMatchDay();
  await kickOff(given);
  const tableButton = screen.getByRole("button", { name: "Tabela completa" });
  await user().click(tableButton);
  expect(document.activeElement).toBe(within(await screen.findByRole("dialog", { name: "Classificação" })).getByRole("heading", { name: "Classificação" }));
  await user().click(screen.getByRole("button", { name: "Fechar" }));
  expect(document.activeElement).toBe(tableButton);

  const lineupButton = screen.getByRole("button", { name: /^Escalação/ });
  await user().click(lineupButton);
  expect(document.activeElement).toBe(within(await lineup()).getByRole("heading", { name: "Escalação" }));
  await user().click(screen.getByRole("button", { name: "Voltar ao jogo" }));
  expect(document.activeElement).toBe(lineupButton);
});

test("a round left mid-match comes back paused at the furthest minute shown", async () => {
  const given = await onMatchDay();
  await kickOff(given);
  play(12);
  const left = shownMinute();
  await vi.waitFor(async () => expect((await given.engine.liveRound())?.seenMinute).toBe(left));
  cleanup();

  openRound(given);
  await screen.findByRole("region", { name: "Seu jogo" });
  expect(shownMinute()).toBe(left);
  play(10);
  expect(shownMinute()).toBe(left);
});

test("when the engine can't be reached the round says so instead of claiming there is no match", async () => {
  const given = await onMatchDay((engine) => ({ ...engine, liveRound: () => Promise.reject(new Error("worker crashed")) }));
  openRound(given);
  expect(await screen.findByText("Não deu para abrir a rodada.")).toBeTruthy();
  expect(screen.queryByText("Nenhum jogo hoje")).toBeNull();
});

test("a substitution is made at the minute on the clock", async () => {
  const given = await onMatchDay();
  const apply = vi.spyOn(given.engine, "apply");
  await kickOff(given);
  play(12);
  const minute = shownMinute();

  await user().click(screen.getByRole("button", { name: /^Escalação/ }));
  const sheet = await lineup();
  const round = await given.engine.liveRound();
  const coach = round?.coach;
  const off = coach?.squad.find((p) => p.id === coach.starters.at(-1));
  const on = coach?.squad.find((p) => p.id === coach.benchIds[0]);
  if (!off || !on) throw new Error("the coach has a starter and a substitute");
  await user().click(within(sheet).getByRole("button", { name: off.name }));
  await user().click(within(within(sheet).getByRole("list", { name: "Banco" })).getByRole("button", { name: on.name }));
  await user().click(within(sheet).getByRole("button", { name: "Voltar ao jogo" }));

  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(apply).toHaveBeenCalledWith({ type: "changeLive", minute, change: { substitutions: [{ offId: off.id, onId: on.id }] } });
  const events = (await given.engine.liveRound())?.matches.find((m) => m.fixtureId === coach?.fixtureId)?.events ?? [];
  expect(events).toContainEqual({ type: "substitution", minute, clubId: "bahia-ba", playerId: on.id, offId: off.id });
  expect(screen.getByRole("button", { name: /^Escalação/ }).textContent).toContain("4 trocas");
});

test("after five substitutions nobody else can come on", async () => {
  const given = await onMatchDay();
  await kickOff(given);
  play(5);
  await user().click(screen.getByRole("button", { name: /^Escalação/ }));
  const sheet = await lineup();
  const coach = (await given.engine.liveRound())?.coach;
  const outfield = coach?.squad.filter((p) => coach.starters.includes(p.id) && p.group !== "GK") ?? [];
  const subs = coach?.squad.filter((p) => coach.benchIds.includes(p.id)) ?? [];
  const bench = within(sheet).getByRole("list", { name: "Banco" });
  for (let i = 0; i < 5; i++) {
    await user().click(within(sheet).getByRole("button", { name: outfield[i]?.name ?? "" }));
    await user().click(within(bench).getByRole("button", { name: subs[i]?.name ?? "" }));
  }
  expect(within(sheet).getByRole("status").textContent).toBe("Sem trocas.");
  for (const starter of within(within(sheet).getByRole("group", { name: "Titulares" })).getAllByRole("button")) expect(starter).toHaveProperty("disabled", true);
  for (const p of within(bench).getAllByRole("button")) expect(p).toHaveProperty("disabled", true);
});

test("at the final whistle the round is recorded and the coach goes back to the hub", async () => {
  const given = await onMatchDay();
  const { date } = await given.engine.read(["date"]);
  await kickOff(given);
  for (let press = 0; press < 12 && shownMinute() < 90; press++) {
    play(90);
    if (shownMinute() < 90) await user().click(screen.getByRole("button", { name: "4x" }));
  }
  const back = await screen.findByRole("button", { name: "Voltar ao clube" });
  expect((await given.engine.read(["date"])).date > date).toBe(true);
  await userEvent.click(back);
  expect(await screen.findByText("Clube aberto")).toBeTruthy();
});

test("a round whose final whistle didn't go through finishes when the coach comes back, and offers a retry if it fails again", async () => {
  let isEngineDown = true;
  const given = await onMatchDay((engine) => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    function apply(command: GameCommand): Promise<unknown> {
      return command.type === "finishRound" && isEngineDown ? Promise.reject(new Error("worker busy")) : engine.apply(command);
    }
    return { ...engine, apply };
  });
  await given.engine.apply({ type: "startRound" });
  await given.engine.apply({ type: "seeMinute", minute: 90 });

  openRound(given);
  expect(await screen.findByText("Não deu para encerrar a rodada.")).toBeTruthy();
  isEngineDown = false;
  await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByRole("button", { name: "Voltar ao clube" })).toBeTruthy();
  expect(await given.engine.liveRound()).toBeNull();
});

test("the board lists every match of the round, and Só meus jogos leaves only the coach's", async () => {
  await kickOff(await onMatchDay());
  const rows = () => screen.getAllByRole("listitem").filter((row) => / \d+ x \d+ /.test(row.getAttribute("aria-label") ?? ""));
  const everyMatch = rows().length;
  expect(everyMatch).toBeGreaterThan(1);
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  expect(rows()).toHaveLength(1);
  expect(rows()[0]?.getAttribute("aria-label")).toContain("Bahia");
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  expect(rows()).toHaveLength(everyMatch);
});
