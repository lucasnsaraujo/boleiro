import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { LiveRound, RoundMatch } from "@boleiro/game-client/round/liveRoundOf";
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

async function kickOff(): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await engine.apply({ type: "playToMatchDay" });
  const given = { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
  const router = createMemoryRouter([{ path: "/round", element: <Round /> }], { initialEntries: ["/round"] });
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Escalação" })).getByRole("button", { name: "Começar a rodada" }));
  await screen.findByRole("region", { name: "Seu jogo" });
  return given;
}

/** A match the board shows open: one of the coach's competition; the rest fold under "Outras ligas". */
const isOnBoard = (round: LiveRound, match: RoundMatch) => match.competitionId === round.matches.find((m) => m.fixtureId === round.coach?.fixtureId)?.competitionId;
const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
const panel = () => screen.findByRole("dialog", { name: "Ficha do jogo" });
/** Lets the clock run for `minutes` match minutes at 1x, or until the round stops by itself. */
const play = (minutes: number) => act(() => vi.advanceTimersByTime(minutes * 660));

test("a row of the live board opens its match in the panel, and another row swaps the panel to its match", async () => {
  const given = await kickOff();
  const round = await given.engine.liveRound();
  const [first, second] = round?.matches.filter((m) => isOnBoard(round, m) && m.fixtureId !== round.coach?.fixtureId) ?? [];
  if (!round || !first || !second) return expect.fail("the round has two other matches");
  const name = (clubId: string) => round.clubs[clubId]?.shortName ?? "";

  await user().click(screen.getByRole("button", { name: `Ficha do jogo: ${name(first.homeId)} x ${name(first.awayId)}` }));
  expect(within(await panel()).getByLabelText(`${name(first.homeId)} 0 x 0 ${name(first.awayId)}`)).toBeTruthy();

  await user().click(screen.getByRole("button", { name: `Ficha do jogo: ${name(second.homeId)} x ${name(second.awayId)}` }));
  await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Ficha do jogo" })).getByLabelText(`${name(second.homeId)} 0 x 0 ${name(second.awayId)}`)).toBeTruthy());
  expect(screen.getAllByRole("dialog", { name: "Ficha do jogo" })).toHaveLength(1);
});

test("the panel follows the round as it runs: a goal on the board lands in the panel's score", async () => {
  const given = await kickOff();
  const round = await given.engine.liveRound();
  const match = round?.matches.find((m) => isOnBoard(round, m) && m.fixtureId !== round.coach?.fixtureId && m.events.some((e) => e.type === "goal" && e.minute < 40));
  const goal = match?.events.find((e) => e.type === "goal");
  if (!round || !match || !goal || goal.type !== "goal") return expect.fail("another match of the round has a goal before the break");
  const name = (clubId: string) => round.clubs[clubId]?.shortName ?? "";
  const home = name(match.homeId);
  const away = name(match.awayId);

  await user().click(screen.getByRole("button", { name: `Ficha do jogo: ${home} x ${away}` }));
  expect(within(await panel()).getByLabelText(`${home} 0 x 0 ${away}`)).toBeTruthy();
  const scored = goal.clubId === match.homeId ? `${home} 1 x 0 ${away}` : `${home} 0 x 1 ${away}`;
  // The clock stops by itself on the coach's goals and incidents: keep it going until the goal's minute is shown.
  for (let step = 0; step < 30 && !within(screen.getByRole("dialog", { name: "Ficha do jogo" })).queryByLabelText(scored); step++) {
    play(goal.minute);
    const resume = screen.queryByRole("button", { name: "1x" });
    if (resume) await user().click(resume);
  }
  expect(within(screen.getByRole("dialog", { name: "Ficha do jogo" })).getByLabelText(scored)).toBeTruthy();
});

test("on the coach's own match the panel offers his substitutions through the lineup sheet", async () => {
  const given = await kickOff();
  const round = await given.engine.liveRound();
  const match = round?.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  if (!round || !match) return expect.fail("the coach plays today");
  const name = (clubId: string) => round.clubs[clubId]?.shortName ?? "";

  await user().click(screen.getByRole("button", { name: `Ficha do jogo: ${name(match.homeId)} x ${name(match.awayId)}` }));
  await user().click(within(await panel()).getByRole("button", { name: "Substituições" }));
  expect(await screen.findByRole("dialog", { name: "Escalação" })).toBeTruthy();
});

test("Ver ficha completa opens the full sheet on its summary, and its tabs switch what it shows", async () => {
  const given = await kickOff();
  const round = await given.engine.liveRound();
  const match = round?.matches.find((m) => isOnBoard(round, m) && m.fixtureId !== round.coach?.fixtureId);
  if (!round || !match) return expect.fail("the round has another match");
  const name = (clubId: string) => round.clubs[clubId]?.shortName ?? "";

  await user().click(screen.getByRole("button", { name: `Ficha do jogo: ${name(match.homeId)} x ${name(match.awayId)}` }));
  await user().click(within(await panel()).getByRole("button", { name: /Ver ficha completa/ }));
  const sheet = await screen.findByRole("dialog", { name: "Ficha completa" });
  expect(within(sheet).getByRole("tab", { name: "Resumo" })).toHaveProperty("ariaSelected", "true");
  expect(within(sheet).getByRole("article", { name: "Jornal da rodada" })).toBeTruthy();

  await user().click(within(sheet).getByRole("tab", { name: "Escalações" }));
  expect(within(sheet).getByRole("img", { name: /^Escalações:/ })).toBeTruthy();
  await user().click(within(sheet).getByRole("tab", { name: "Confronto" }));
  expect(within(sheet).getByRole("region", { name: "Na tabela" })).toBeTruthy();
});
