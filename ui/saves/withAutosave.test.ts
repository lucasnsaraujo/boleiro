import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import type { CurrentGameRef } from "./currentGame.js";
import { indexedDbSlots } from "./indexedDbSlots.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import { withAutosave } from "./withAutosave.js";

const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function startGame() {
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const slots = indexedDbSlots(new IDBFactory());
  const game: CurrentGameRef = { current: { slotId: "slot-1", coachName: "Tite" } };
  const engine = withAutosave(raw, slots, game);
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const { calendar } = await engine.read(["calendar"]);
  const firstMatchDay = calendar.stateChampionshipDates[0] ?? "";
  return { engine, slots, game, daysToFirstMatch: Number(firstMatchDay.slice(8, 10)) - 1 };
}

test("days without matches leave the autosave slot empty", async () => {
  const { engine, slots, daysToFirstMatch } = await startGame();
  await engine.advance(Array.from({ length: daysToFirstMatch }, () => ({})));
  expect(await slots.list()).toEqual([]);
});

test("a played round is autosaved with the coach's name and the game's date", async () => {
  const { engine, slots, daysToFirstMatch } = await startGame();
  const { date } = await engine.advance(Array.from({ length: daysToFirstMatch + 1 }, () => ({})));
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID, gameSlotId: "slot-1", coachName: "Tite", date, coachClubId: "bahia-ba", division: "A" }]);
});

test("playing on to the match day autosaves the rounds other clubs played on the way", async () => {
  const { engine, slots } = await startGame();
  await engine.advance([{}]);
  const { fixtures } = await engine.read(["fixtures"]);
  const othersFirst = fixtures.map((f) => f.date).sort()[0] ?? "";
  const ownFirst = fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").map((f) => f.date).sort()[0] ?? "";
  expect(othersFirst < ownFirst).toBe(true);
  const { date } = await engine.playToMatchDay();
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID, date }]);
});

test("playing on when already on the match day plays nothing and saves nothing", async () => {
  const { engine, slots } = await startGame();
  await engine.playToMatchDay();
  await slots.remove(AUTOSAVE_SLOT_ID);
  await engine.playToMatchDay();
  expect(await slots.list()).toEqual([]);
});

test("a failed autosave still returns the round that was played", async () => {
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const broken = { ...indexedDbSlots(new IDBFactory()), write: () => Promise.reject(new Error("disk full")) };
  const engine = withAutosave(raw, broken, { current: { slotId: "slot-1", coachName: "Tite" } });
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const { events } = await engine.advance(Array.from({ length: 40 }, () => ({})));
  expect(events.some((event) => event.type === "matchPlayed")).toBe(true);
});

test("with no game open on the screens nothing is autosaved", async () => {
  const { engine, slots, game, daysToFirstMatch } = await startGame();
  game.current = null;
  await engine.advance(Array.from({ length: daysToFirstMatch + 1 }, () => ({})));
  expect(await slots.list()).toEqual([]);
});
