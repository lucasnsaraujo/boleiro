import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRunCommand } from "../app/AppCommands.js";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import type { CommandId } from "../app/shortcuts.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { HumanSide, LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { SILENT_SOUND } from "../sound/soundEngine.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Round } from "./Round.js";

const ANA = { name: "Ana", clubId: "flamengo-rj" };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };
const MAX_STEPS = 60;

const closers: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const close of closers.splice(0)) close();
});

/** A two-coach game kicked off on the first day both coaches' clubs play; Bruno, last of the turn, is in the seat. */
async function bothCoachesPlaying(): Promise<{ given: Services; sides: HumanSide[] }> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 3, choices: { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] } } });
  for (let step = 0; step < MAX_STEPS; step++) {
    if (!(await engine.hotSeat())?.isLastTurn) {
      await engine.apply({ type: "passTurn" });
      continue;
    }
    if ((await engine.apply({ type: "playToMatchDay" })).daysPlayed > 0) continue;
    const round = await engine.apply({ type: "startRound" });
    const sides = round.humanSides ?? [];
    if (sides.length === 2 && sides[0]?.fixtureId !== sides[1]?.fixtureId) {
      return { given: { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: ANA.name } } }, sides };
    }
    await engine.apply({ type: "finishRound" });
  }
  throw new Error("both coaches play on some day");
}

let runCommand: (id: CommandId) => boolean = () => false;
function CommandProbe() {
  runCommand = useRunCommand();
  return null;
}

const play = vi.fn();

/** Space, once the round has its match keys: the round takes them in an effect after it first shows. */
async function pressSpace() {
  await vi.waitFor(() => {
    let isTaken = false;
    act(() => {
      isTaken = runCommand("pausar");
    });
    expect(isTaken).toBe(true);
  });
}

function openRound(given: Services) {
  const router = createMemoryRouter([{ path: "/round", element: <Round /> }], { initialEntries: ["/round"] });
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={{ ...SILENT_SOUND, play }} store={localStorage}>
        <CommandProbe />
        <RouterProvider router={router} />
      </SoundProvider>
    </ServicesContext>,
  );
}

const lineup = () => screen.findByRole("dialog", { name: "Escalação" });
const whoseMatch = (sheet: HTMLElement) => within(within(sheet).getByRole("group", { name: "Jogos dos técnicos" })).getByText(/^(Ana|Bruno)$/).textContent;
/** The open lineup turns to `coach`'s match; it changes once the session has taken the last one's changes. */
const showsMatchOf = (coach: string) => vi.waitFor(() => expect(whoseMatch(screen.getByRole("dialog", { name: "Escalação" }))).toBe(coach));

test("in a hot-seat round, Space stops the clock on the first coach's match and the arrow keys step through every human coach's match in turn order", async () => {
  const { given } = await bothCoachesPlaying();
  openRound(given);
  await screen.findByRole("region", { name: "Seu jogo" });

  await pressSpace();
  const sheet = await lineup();
  expect(whoseMatch(sheet)).toBe(ANA.name);
  expect(within(sheet).getByText(/Flamengo/)).toBeTruthy();

  // The arrows stay the penalty taker list's own while it has the focus.
  fireEvent.keyDown(within(sheet).getByRole("combobox", { name: "Pênalti" }), { key: "ArrowRight" });
  expect(whoseMatch(await lineup())).toBe(ANA.name);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await showsMatchOf(BRUNO.name);
  expect(within(await lineup()).getByText(/Palmeiras/)).toBeTruthy();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await showsMatchOf(ANA.name);
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await showsMatchOf(BRUNO.name);

  await userEvent.click(within(await lineup()).getByRole("button", { name: "Voltar ao jogo" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(screen.getByRole("group", { name: "Velocidade" })).getByRole("button", { pressed: true }).getAttribute("aria-label")).not.toBe("Pausar");
});

test("a substitute dragged from the bench onto a starter comes on in that coach's match, with the substitution's sound, and the board calls it out", async () => {
  const { given, sides } = await bothCoachesPlaying();
  const anas = sides.find((side) => side.clubId === ANA.clubId);
  const off = anas?.squad.find((p) => p.id === anas.starters.at(-1));
  const on = anas?.squad.find((p) => p.id === anas.benchIds[0]);
  if (!anas || !off || !on) throw new Error("Ana has a starter and a substitute");
  const apply = vi.spyOn(given.engine, "apply");
  openRound(given);
  await screen.findByRole("region", { name: "Seu jogo" });
  await pressSpace();
  const sheet = await lineup();

  const benchRow = within(within(sheet).getByRole("list", { name: "Banco" })).getByRole("button", { name: on.name }).closest("li");
  const starter = within(within(sheet).getByRole("group", { name: "Titulares" })).getByRole("button", { name: off.name });
  if (!benchRow) throw new Error("the substitute has a bench row");
  fireEvent.pointerDown(benchRow, { button: 0, clientX: 600, clientY: 400 });
  fireEvent.pointerMove(starter, { clientX: 200, clientY: 300 });
  expect(within(sheet).getByRole("status").textContent).toBe(`Sai ${off.name}, entra ${on.name}.`);
  fireEvent.pointerUp(starter, { clientX: 200, clientY: 300 });

  const pitch = within(sheet).getByRole("group", { name: "Titulares" });
  expect(within(pitch).getByRole("button", { name: on.name })).toBeTruthy();
  expect(within(pitch).queryByRole("button", { name: off.name })).toBeNull();
  expect(play).toHaveBeenCalledWith("substitution");

  await userEvent.click(within(sheet).getByRole("button", { name: "Voltar ao jogo" }));
  expect(apply).toHaveBeenCalledWith({ type: "changeLive", minute: 0, change: { substitutions: [{ offId: off.id, onId: on.id }] }, clubId: ANA.clubId });
  const anasRow = screen.getAllByRole("listitem").find((li) => li.classList.contains("human") && li.textContent?.includes(`Entra ${on.name}`));
  expect(anasRow?.textContent).toContain("Troca");
});

test("an injury in each human coach's match opens his window, one coach at a time in turn order", async () => {
  const MINUTE = 3;
  const { given, sides } = await bothCoachesPlaying();
  const hurtIn = (side: HumanSide): MatchEvent => ({ type: "injury", minute: MINUTE, clubId: side.clubId, playerId: side.starters.at(-1) ?? "", days: 9 });
  const quiet = (e: MatchEvent) => e.minute > MINUTE || !("clubId" in e);
  const withInjuries = (round: LiveRound): LiveRound => ({
    ...round,
    matches: round.matches.map((m) => {
      const side = sides.find((s) => s.fixtureId === m.fixtureId);
      return side ? { ...m, events: [hurtIn(side), ...m.events.filter(quiet)] } : m;
    }),
  });
  const { engine } = given;
  const liveRound = async () => {
    const round = await engine.liveRound();
    return round && withInjuries(round);
  };
  openRound({ ...given, engine: { ...engine, liveRound } });
  await screen.findByRole("region", { name: "Seu jogo" });
  await userEvent.click(screen.getByRole("button", { name: "1x" }));
  act(() => vi.advanceTimersByTime(MINUTE * 660));

  const first = await screen.findByRole("dialog", { name: /^Machucou/ });
  expect(first.textContent).toContain("Ana · Flamengo");
  await userEvent.click(within(first).getByRole("button", { name: "Deixar como está" }));
  const second = await screen.findByRole("dialog", { name: /^Machucou/ });
  expect(second.textContent).toContain("Bruno · Palmeiras");
  await userEvent.click(within(second).getByRole("button", { name: "Deixar como está" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("when only one human coach plays today, his lineup opens without steps to other matches", async () => {
  const { given } = await bothCoachesPlaying();
  const { engine } = given;
  const liveRound = async () => {
    const round = await engine.liveRound();
    return round && { ...round, humanSides: round.humanSides?.filter((side) => side.clubId === ANA.clubId) };
  };
  openRound({ ...given, engine: { ...engine, liveRound } });
  await screen.findByRole("region", { name: "Seu jogo" });
  await pressSpace();
  const sheet = await lineup();
  expect(within(sheet).getByText(/Flamengo/)).toBeTruthy();
  expect(within(sheet).queryByRole("group", { name: "Jogos dos técnicos" })).toBeNull();
});

test("each human coach's match plays on a board of its own, and ← → move the focus through them in turn order, which Space then opens", async () => {
  const { given } = await bothCoachesPlaying();
  openRound(given);
  const band = await screen.findByRole("region", { name: "Seu jogo" });
  const board = (coach: string) => within(band).getByRole("region", { name: new RegExp(`^${coach}: `) });
  expect(board(ANA.name).getAttribute("aria-current")).toBe("true");
  expect(board(BRUNO.name).getAttribute("aria-current")).toBeNull();
  expect(board(BRUNO.name).getAttribute("aria-label")).toMatch(/Palmeiras/);

  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(board(BRUNO.name).getAttribute("aria-current")).toBe("true");
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(board(ANA.name).getAttribute("aria-current")).toBe("true");
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(board(BRUNO.name).getAttribute("aria-current")).toBe("true");

  await pressSpace();
  expect(whoseMatch(await lineup())).toBe(BRUNO.name);
  // Inside the window the arrows are the window's: they step its match, and the board in focus follows.
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await showsMatchOf(ANA.name);
  await userEvent.click(within(await lineup()).getByRole("button", { name: "Voltar ao jogo" }));
  expect(board(ANA.name).getAttribute("aria-current")).toBe("true");
});
