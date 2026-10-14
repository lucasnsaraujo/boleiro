import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import type { EngineClient } from "../engine/connectEngine.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "./indexedDbSlots.js";
import { loadFromSlot, saveToSlot } from "./saveToSlot.js";
import type { SlotMeta } from "./slotMeta.js";

const closers: (() => void)[] = [];

function startEngine(): EngineClient {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  return engine;
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

test("saving lists the slot with the coach's name and the game's date, club and division", async () => {
  const engine = startEngine();
  const slots = indexedDbSlots(new IDBFactory());
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await engine.apply({ type: "advance", days: [{}, {}] });
  await saveToSlot(engine, slots, "slot-1", { slotId: "slot-1", coachName: "Tite" }, new Date("2026-10-10T12:00:00Z"));
  expect(await slots.list()).toEqual([
    { id: "slot-1", gameSlotId: "slot-1", coachName: "Tite", savedAt: "2026-10-10T12:00:00.000Z", date: "2026-01-03", season: 2026, coachClubId: "bahia-ba", division: "A" },
  ]);
});

test("loading a slot puts its game back in the engine", async () => {
  const engine = startEngine();
  const slots = indexedDbSlots(new IDBFactory());
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await saveToSlot(engine, slots, "slot-1", { slotId: "slot-1", coachName: "Tite" }, new Date("2026-10-10T12:00:00Z"));
  await engine.apply({ type: "advance", days: [{}, {}, {}] });
  expect(await loadFromSlot(engine, slots, "slot-1")).toEqual({ date: "2026-01-01", season: 2026, coachClubId: "bahia-ba" });
  expect(await engine.read(["date"])).toEqual({ date: "2026-01-01" });
});

/** Writes a slot as the store did before shards: database version 1, the save as one string next to its meta. */
async function writeBeforeShards(factory: IDBFactory, meta: SlotMeta, save: string): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("boleiro", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("slots", { keyPath: "id" });
      request.result.createObjectStore("saves");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction(["slots", "saves"], "readwrite");
  transaction.objectStore("slots").put(meta);
  transaction.objectStore("saves").put(save, meta.id);
  await new Promise((resolve) => (transaction.oncomplete = resolve));
  database.close();
}

test("a game saved whole before shards still loads, and saving it again moves the slot to shards under the new meta", async () => {
  const engine = startEngine();
  const factory = new IDBFactory();
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  await engine.apply({ type: "advance", days: [{}, {}] });
  const before: SlotMeta = { id: "slot-1", gameSlotId: "slot-1", coachName: "Tite", savedAt: "2026-10-01T12:00:00.000Z", date: "2026-01-03", season: 2026, coachClubId: "bahia-ba", division: "A" };
  await writeBeforeShards(factory, before, await engine.save());
  await engine.apply({ type: "newGame", seed: 8, choices: { coachClubId: "flamengo-rj" } });
  const slots = indexedDbSlots(factory);
  expect(await slots.list()).toEqual([before]);
  expect(await loadFromSlot(engine, slots, "slot-1")).toEqual({ date: "2026-01-03", season: 2026, coachClubId: "bahia-ba" });
  await engine.apply({ type: "advance", days: [{}, {}, {}] });
  await saveToSlot(engine, slots, "slot-1", { slotId: "slot-1", coachName: "Tite" }, new Date("2026-10-10T12:00:00Z"));
  expect(await slots.list()).toEqual([{ ...before, savedAt: "2026-10-10T12:00:00.000Z", date: "2026-01-06" }]);
  expect(typeof (await slots.read("slot-1"))).toBe("object");
  await engine.apply({ type: "newGame", seed: 8, choices: { coachClubId: "flamengo-rj" } });
  expect(await loadFromSlot(engine, slots, "slot-1")).toEqual({ date: "2026-01-06", season: 2026, coachClubId: "bahia-ba" });
});
