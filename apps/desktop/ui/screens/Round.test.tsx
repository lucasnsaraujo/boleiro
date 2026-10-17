import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRunCommand } from "../app/AppCommands.js";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { CommandId } from "../app/shortcuts.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
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
  await engine.apply({ type: "newGame", seed: 11, choices: { coachClubId: "bahia-ba" } });
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

let runCommand: (id: CommandId) => boolean = () => false;
/** Reaches the commands the round registers, as the keyboard does through the shell. */
function CommandProbe() {
  runCommand = useRunCommand();
  return null;
}

test("in the match, Space pauses and resumes, the number keys pick the speed and T opens the live table", async () => {
  render(<CommandProbe />);
  await kickOff(await onMatchDay());
  const run = (id: CommandId) => act(() => void runCommand(id));
  const pressed = () => within(screen.getByRole("group", { name: "Velocidade" })).getByRole("button", { pressed: true }).getAttribute("aria-label");
  run("velocidade3");
  expect(pressed()).toBe("4x");
  run("pausar");
  expect(pressed()).toBe("Pausar");
  run("pausar");
  expect(pressed()).toBe("4x");
  run("velocidade1");
  expect(pressed()).toBe("1x");
  run("tabelaAoVivo");
  expect(await screen.findByRole("dialog", { name: "Classificação" })).toBeTruthy();
});

test("the coach's match plays on a board in the band; while the clock runs the score stickers lift off it, and a pause drops them back", async () => {
  await kickOff(await onMatchDay());
  const band = screen.getByRole("region", { name: "Seu jogo" });
  const stickers = () => band.querySelector(".live-mid");
  expect(band.querySelectorAll(".lp")).toHaveLength(1);
  expect(stickers()?.classList.contains("is-lifted")).toBe(false);
  await user().click(screen.getByRole("button", { name: "1x" }));
  play(2);
  expect(stickers()?.classList.contains("is-lifted")).toBe(true);
  await user().click(screen.getByRole("button", { name: "Pausar" }));
  expect(stickers()?.classList.contains("is-lifted")).toBe(false);
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

test("competitions without a human coach fold under Outras ligas, which opens them, and Só meus jogos hides it", async () => {
  await kickOff(await onMatchDay());
  const rows = () => screen.getAllByRole("listitem").filter((row) => / \d+ x \d+ /.test(row.getAttribute("aria-label") ?? ""));
  const folded = rows().length;
  const others = screen.getByRole("button", { name: /Outras ligas/ });
  expect(others.getAttribute("aria-expanded")).toBe("false");
  await user().click(others);
  expect(others.getAttribute("aria-expanded")).toBe("true");
  expect(rows().length).toBeGreaterThan(folded);
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  expect(screen.queryByRole("button", { name: /Outras ligas/ })).toBeNull();
  expect(rows()).toHaveLength(1);
});

test("a paused round says Pausado beside the clock, and the label goes when it plays again", async () => {
  await kickOff(await onMatchDay());
  const cover = screen.getByRole("region", { name: "Seu jogo" });
  expect(within(cover).queryByText("Pausado")).toBeNull();
  await user().click(screen.getByRole("button", { name: "Pausar" }));
  expect(within(cover).getByText("Pausado")).toBeTruthy();
  await user().click(screen.getByRole("button", { name: "2x" }));
  expect(within(cover).queryByText("Pausado")).toBeNull();
});

test("rows hidden by Só meus jogos come back as they were, so their old goals don't flash again", async () => {
  await kickOff(await onMatchDay());
  const other = screen.getAllByRole("listitem").find((row) => / \d+ x \d+ /.test(row.getAttribute("aria-label") ?? "") && !row.getAttribute("aria-label")?.includes("Bahia"));
  expect(other).toBeDefined();
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  expect(other?.isConnected).toBe(true);
});

test("a goal's flash leaves its row once played, so Só meus jogos turned off doesn't play it again", async () => {
  await kickOff(await onMatchDay());
  const otherRows = () => screen.getAllByRole("listitem").filter((row) => / \d+ x \d+ /.test(row.getAttribute("aria-label") ?? "") && !row.getAttribute("aria-label")?.includes("Bahia"));
  let scored: HTMLElement | undefined;
  for (let minute = 0; minute < 90 && !scored; minute++) {
    const paused = screen.getByRole("button", { name: "Pausar" });
    if (paused.getAttribute("aria-pressed") === "true") fireEvent.click(screen.getByRole("button", { name: "1x" }));
    play(1);
    scored = otherRows().find((row) => within(row).queryByText("Gol"));
  }
  if (!scored) throw new Error("another match of the round has a goal");
  const row = scored;
  const celebration = () => [within(row).queryByText("Gol"), row.querySelector(".flash"), row.querySelector(".roll")];
  expect(row.querySelector(".roll")).not.toBeNull();

  await waitFor(() => expect(celebration()).toEqual([null, null, null]), { timeout: 3000 });
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  await user().click(screen.getByRole("checkbox", { name: "Só meus jogos" }));
  expect(row.hidden).toBe(false);
  expect(celebration()).toEqual([null, null, null]);
});

test("a red card and an injury to the coach's side stop the round with a window of the assistant's substitutions, each one a switch", async () => {
  const MINUTE = 4;
  let sentOff = "";
  let hurt = "";
  const given = await onMatchDay((engine) => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      const result = await engine.apply(command);
      if (command.type !== "startRound" && command.type !== "changeLive") return result;
      const round = result as CommandResults["startRound"];
      const coach = round.coach;
      const defender = coach?.squad.find((p) => coach.starters.includes(p.id) && p.group === "DEF");
      const midfielder = coach?.squad.find((p) => coach.starters.includes(p.id) && p.group === "MID");
      if (!coach || !defender || !midfielder) throw new Error("the coach starts a defender and a midfielder");
      sentOff = defender.id;
      hurt = midfielder.id;
      const incidents = [
        { type: "card", minute: MINUTE, clubId: "bahia-ba", playerId: defender.id, card: "red" },
        { type: "injury", minute: MINUTE, clubId: "bahia-ba", playerId: midfielder.id, days: 18 },
      ] as const;
      const mine = (m: (typeof round.matches)[number]) => m.fixtureId === coach.fixtureId;
      const matches = round.matches.map((m) => (mine(m) ? { ...m, events: [...incidents, ...m.events.filter((e) => e.minute !== MINUTE || e.type === "substitution")] } : m));
      return { ...round, matches };
    }
    return { ...engine, apply };
  });
  const apply = vi.spyOn(given.engine, "apply");
  await kickOff(given);
  // A minute at a time, so the screen sees each minute the clock shows.
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);

  const window = await screen.findByRole("dialog", { name: /^Expulso:/ });
  expect(shownMinute()).toBe(MINUTE);
  expect(screen.getByRole("button", { name: "Pausar" })).toHaveProperty("ariaPressed", "true");
  const round = await given.engine.liveRound();
  const nameOf = (id: string) => round?.coach?.squad.find((p) => p.id === id)?.name ?? "";
  expect(window.textContent).toContain(nameOf(sentOff));
  expect(window.textContent).toContain(`${nameOf(hurt)} se machucou`);
  expect(window.textContent).toContain("Fora de 2 a 3 semanas.");
  const switches = within(window).getAllByRole("checkbox");
  expect(switches).toHaveLength(2);
  expect(within(window).getByRole("button", { name: "Fazer as 2 trocas" })).toBeTruthy();

  await user().click(switches[0] as HTMLElement);
  await user().click(within(window).getByRole("button", { name: "Fazer a troca" }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const sent = apply.mock.calls.flatMap(([command]) => (command.type === "changeLive" ? [command] : []));
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ minute: MINUTE, change: { substitutions: [{ offId: hurt }] } });
  expect(screen.getByRole("button", { name: "Pausar" })).toHaveProperty("ariaPressed", "false");
});

test("leaving the incident window as it is changes nothing and plays on", async () => {
  const MINUTE = 3;
  const given = await onMatchDay((engine) => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      const result = await engine.apply(command);
      if (command.type !== "startRound") return result;
      const round = result as CommandResults["startRound"];
      const coach = round.coach;
      const forward = coach?.squad.find((p) => coach.starters.includes(p.id) && p.group === "ATT");
      if (!coach || !forward) throw new Error("the coach starts a forward");
      const injury = { type: "injury", minute: MINUTE, clubId: "bahia-ba", playerId: forward.id, days: 4 } as const;
      return { ...round, matches: round.matches.map((m) => (m.fixtureId === coach.fixtureId ? { ...m, events: [injury, ...m.events.filter((e) => e.minute !== MINUTE)] } : m)) };
    }
    return { ...engine, apply };
  });
  const apply = vi.spyOn(given.engine, "apply");
  await kickOff(given);
  // A minute at a time, so the screen sees each minute the clock shows.
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);
  const window = await screen.findByRole("dialog", { name: /^Machucou:/ });
  expect(window.textContent).toContain("Fora de 4 dias.");
  await user().click(within(window).getByRole("button", { name: "Deixar como está" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  play(2);
  expect(shownMinute()).toBeGreaterThan(MINUTE);
  expect(apply.mock.calls.some(([command]) => command.type === "changeLive")).toBe(false);
});

/** A session whose coach's match has `incident`, one event or several, at its minute and nothing else of the coach's side before it. */
function withIncidentAt(minute: number, incident: (coach: NonNullable<CommandResults["startRound"]["coach"]>) => MatchEvent | readonly MatchEvent[]) {
  return (engine: EngineClient): EngineClient => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      const result = await engine.apply(command);
      if (command.type !== "startRound") return result;
      const round = result as CommandResults["startRound"];
      const coach = round.coach;
      if (!coach) throw new Error("the coach has a match");
      const quiet = (e: MatchEvent) => e.minute > minute || !("clubId" in e);
      return { ...round, matches: round.matches.map((m) => (m.fixtureId === coach.fixtureId ? { ...m, events: [...[incident(coach)].flat(), ...m.events.filter(quiet)] } : m)) };
    }
    async function liveRound() {
      const round = await engine.liveRound();
      const coach = round?.coach;
      if (!round || !coach) return round;
      const quiet = (e: MatchEvent) => e.minute > minute || !("clubId" in e);
      return { ...round, matches: round.matches.map((m) => (m.fixtureId === coach.fixtureId ? { ...m, events: [...[incident(coach)].flat(), ...m.events.filter(quiet)] } : m)) };
    }
    return { ...engine, apply, liveRound };
  };
}

const hurtForward = (minute: number) => (coach: NonNullable<CommandResults["startRound"]["coach"]>): MatchEvent => {
  const forward = coach.squad.find((p) => coach.starters.includes(p.id) && p.group === "ATT");
  return { type: "injury", minute, clubId: "bahia-ba", playerId: forward?.id ?? "", days: 9 };
};

/** A red card for the coach's first defender that VAR gives at `minute`, the check coming before the card. */
const sentOffByVar = (minute: number) => (coach: NonNullable<CommandResults["startRound"]["coach"]>): MatchEvent[] => {
  const playerId = coach.squad.find((p) => coach.starters.includes(p.id) && p.group === "DEF")?.id ?? "";
  return [
    { type: "varCheck", minute, clubId: "bahia-ba", playerId, decision: "redCardGiven", seconds: 60 },
    { type: "card", minute, clubId: "bahia-ba", playerId, card: "red" },
  ];
};

test("a red card VAR gives the coach's side stops the round with the decision, so a speed picked during the check still leaves its window paused", async () => {
  const MINUTE = 6;
  const pauseButton = () => screen.getByRole("button", { name: "Pausar" });
  await kickOff(await onMatchDay(withIncidentAt(MINUTE, sentOffByVar(MINUTE))));
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);
  await screen.findByText("VAR checando o lance");
  expect(screen.getByLabelText("Minuto").textContent).toBe("VAR");
  // The clock doesn't give the decision away while VAR checks.
  expect(pauseButton()).toHaveProperty("ariaPressed", "false");

  await user().click(screen.getByRole("button", { name: "2x" }));
  const window = await screen.findByRole("dialog", { name: /^Expulso:/ }, { timeout: 5_000 });
  expect(pauseButton()).toHaveProperty("ariaPressed", "true");

  await user().click(within(window).getByRole("button", { name: "Deixar como está" }));
  await waitFor(() => expect(screen.queryByText("VAR checando o lance")).toBeNull(), { timeout: 5_000 });
  act(() => vi.advanceTimersByTime(2 * 330));
  expect(shownMinute()).toBeGreaterThan(MINUTE);
}, 30_000);

test("an injury in first-half stoppage time opens the incident window at half-time", async () => {
  const given = await onMatchDay(withIncidentAt(HALF_TIME, hurtForward(HALF_TIME)));
  await kickOff(given);
  for (let minute = 0; minute < HALF_TIME + 2; minute++) play(1);
  expect(shownMinute()).toBe(HALF_TIME);
  expect(await screen.findByRole("dialog", { name: /^Machucou:/ })).toBeTruthy();
});

test("coming back to a round stopped on an incident opens its window again", async () => {
  const MINUTE = 6;
  const given = await onMatchDay(withIncidentAt(MINUTE, hurtForward(MINUTE)));
  await kickOff(given);
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);
  await screen.findByRole("dialog", { name: /^Machucou:/ });
  await vi.waitFor(async () => expect((await given.engine.liveRound())?.seenMinute).toBe(MINUTE));
  cleanup();
  openRound(given);
  expect(await screen.findByRole("dialog", { name: /^Machucou:/ })).toBeTruthy();
  expect(shownMinute()).toBe(MINUTE);
});

test("no window opens when the session leaves the coach's incidents to something else", async () => {
  const MINUTE = 5;
  const handledElsewhere = (engine: EngineClient): EngineClient => {
    const injured = withIncidentAt(MINUTE, hurtForward(MINUTE))(engine);
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      const result = await injured.apply(command);
      if (command.type !== "startRound") return result;
      const round = result as CommandResults["startRound"];
      return round.coach ? { ...round, coach: { ...round.coach, incidentHandling: "aiSubstitutions" } } : round;
    }
    return { ...injured, apply };
  };
  const given = await onMatchDay(handledElsewhere);
  await kickOff(given);
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);
  expect(shownMinute()).toBe(MINUTE);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("an incident on the coach's match takes over from an open ficha, which comes back once the window shuts", async () => {
  const MINUTE = 6;
  const given = await onMatchDay(withIncidentAt(MINUTE, hurtForward(MINUTE)));
  await kickOff(given);
  const [row] = screen.getAllByRole("button", { name: /^Ficha do jogo: / });
  if (!row) return expect.fail("the board lists the round's matches");
  await user().click(row);
  await user().click(within(await screen.findByRole("dialog", { name: "Ficha do jogo" })).getByRole("button", { name: /Ver ficha completa/ }));
  await screen.findByRole("dialog", { name: "Ficha completa" });
  for (let minute = 0; minute < MINUTE + 2; minute++) play(1);
  const window = await screen.findByRole("dialog", { name: /^Machucou:/ });
  expect(screen.queryByRole("dialog", { name: "Ficha completa" })).toBeNull();
  await user().click(within(window).getByRole("button", { name: "Deixar como está" }));
  expect(await screen.findByRole("dialog", { name: "Ficha completa" })).toBeTruthy();
});
