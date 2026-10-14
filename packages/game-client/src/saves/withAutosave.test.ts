import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import type { EngineClient } from "../engine/connectEngine.js";
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

test("playing on through days with no match anywhere still autosaves", async () => {
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const slots = indexedDbSlots(new IDBFactory());
  const stoppedByAnOffer = {
    ...raw,
    playToMatchDay: async () => ({ date: (await raw.advance([{}])).date, stop: "jobOffer" as const, daysPlayed: 1 }),
  };
  const engine = withAutosave(stoppedByAnOffer, slots, { current: { slotId: "slot-1", coachName: "Tite" } });
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  const { date } = await engine.playToMatchDay();
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID, date }]);
});

test("the final whistle of a live round is autosaved on the day after the match", async () => {
  const { engine, slots } = await startGame();
  await engine.playToMatchDay();
  await slots.remove(AUTOSAVE_SLOT_ID);
  await engine.startRound({});
  const { date } = await engine.finishRound();
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID, date }]);
});

test("a round left mid-match is autosaved at the furthest minute shown, so a reload can't replay it", async () => {
  const { engine, slots } = await startGame();
  await engine.playToMatchDay();
  await engine.startRound({});
  await engine.seeMinute(60);
  const { engine: reloaded, close } = inMemoryEngine();
  closers.push(close);
  await reloaded.load(await slots.read(AUTOSAVE_SLOT_ID));
  expect((await reloaded.liveRound())?.seenMinute).toBe(60);
  await expect(reloaded.changeLive(30, { posture: "attacking" })).rejects.toThrow("a change can't come before minute 60");
});

test("a live round is autosaved every quarter of an hour shown, not on every minute", async () => {
  const { engine, slots } = await startGame();
  await engine.playToMatchDay();
  await engine.startRound({});
  await slots.remove(AUTOSAVE_SLOT_ID);
  for (let minute = 1; minute < 15; minute++) await engine.seeMinute(minute);
  expect(await slots.list()).toEqual([]);
  await engine.seeMinute(15);
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID }]);
});

test("autosaves asked for while one is being written are written one at a time, the latest last", async () => {
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const store = indexedDbSlots(new IDBFactory());
  let writing = 0;
  let mostAtOnce = 0;
  const slots = {
    ...store,
    async write(...args: Parameters<typeof store.write>) {
      mostAtOnce = Math.max(mostAtOnce, ++writing);
      await store.write(...args);
      writing--;
    },
  };
  const engine = withAutosave(raw, slots, { current: { slotId: "slot-1", coachName: "Tite" } });
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.playToMatchDay();
  await engine.startRound({});
  await Promise.all([15, 30, 45, 60].map((minute) => engine.seeMinute(minute)));
  expect(mostAtOnce).toBe(1);
  const { engine: reloaded, close: closeReloaded } = inMemoryEngine();
  closers.push(closeReloaded);
  await reloaded.load(await store.read(AUTOSAVE_SLOT_ID));
  expect((await reloaded.liveRound())?.seenMinute).toBe(60);
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

test("turning an offer down is autosaved, so it stays declined after a reload", async () => {
  const { engine } = await startGame();
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const slots = indexedDbSlots(new IDBFactory());
  const career = withAutosave(raw, slots, { current: { slotId: "slot-1", coachName: "Tite" } });
  await career.newGame(7, { coachClubId: null, careerMode: true });
  const [declined, ...kept] = (await career.read(["coach"])).coach.offers;
  await career.declineOffer(declined?.clubId ?? "");
  await engine.load(await slots.read(AUTOSAVE_SLOT_ID));
  expect((await engine.read(["coach"])).coach.offers).toEqual(kept);
});

async function rivalPlayerOf(engine: EngineClient, clubId: string): Promise<string> {
  const { players } = await engine.read(["players"]);
  const found = Object.values(players).find((p) => p.clubId === clubId);
  if (!found) throw new Error(`no player at ${clubId}`);
  return found.id;
}

test("a request put on the desk is autosaved, so it is still pending after a reload", async () => {
  const { engine, slots } = await startGame();
  const playerId = await rivalPlayerOf(engine, "palmeiras-sp");
  await engine.ask({ kind: "sign", playerId });
  await engine.newGame(8, { coachClubId: "bahia-ba" });
  await engine.load(await slots.read(AUTOSAVE_SLOT_ID));
  expect((await engine.desk()).pending).toEqual([{ kind: "sign", playerId }]);
});

test("withdrawing a request is autosaved, so it stays off the desk after a reload", async () => {
  const { engine, slots } = await startGame();
  const playerId = await rivalPlayerOf(engine, "palmeiras-sp");
  await engine.ask({ kind: "sign", playerId });
  await engine.withdraw(playerId);
  await engine.load(await slots.read(AUTOSAVE_SLOT_ID));
  expect((await engine.desk()).pending).toEqual([]);
});

test("closing a turning point is autosaved, so its screen does not come back after a reload", async () => {
  const { engine, slots } = await startGame();
  await engine.advance(Array.from({ length: 365 }, () => ({})));
  expect(await engine.turningPoint()).toMatchObject({ kind: "seasonEnd" });
  await engine.closeTurningPoint();
  await engine.newGame(8, { coachClubId: "bahia-ba" });
  await engine.load(await slots.read(AUTOSAVE_SLOT_ID));
  expect(await engine.turningPoint()).toBeNull();
});

test("signing an offer on a day with no match is autosaved, so the coach keeps his new club after a reload", async () => {
  const { engine: raw, close } = inMemoryEngine();
  closers.push(close);
  const slots = indexedDbSlots(new IDBFactory());
  const career = withAutosave(raw, slots, { current: { slotId: "slot-1", coachName: "Tite" } });
  await career.newGame(7, { coachClubId: null, careerMode: true });
  const [offer] = (await career.read(["coach"])).coach.offers;
  if (!offer) throw new Error("a career game starts with offers");
  const { events } = await career.advance([{ acceptOffer: offer.clubId }]);
  expect(events.some((event) => event.type === "matchPlayed")).toBe(false);
  expect(await slots.list()).toMatchObject([{ id: AUTOSAVE_SLOT_ID, coachClubId: offer.clubId }]);
});
