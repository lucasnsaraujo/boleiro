import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import type { EngineClient } from "../engine/connectEngine.js";
import { inMemoryEngine } from "../engine/inMemoryEngine.js";
import { indexedDbSlots } from "./indexedDbSlots.js";
import { loadFromSlot, saveToSlot } from "./saveToSlot.js";

const closers: (() => void)[] = [];

function startEngine(): EngineClient {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  return engine;
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

test("saving lists the slot under its name with the game's date and club", async () => {
  const engine = startEngine();
  const slots = indexedDbSlots(new IDBFactory());
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await engine.advance([{}, {}]);
  await saveToSlot(engine, slots, { id: "slot-1", name: "Bahia 2026" }, new Date("2026-10-10T12:00:00Z"));
  expect(await slots.list()).toEqual([
    { id: "slot-1", name: "Bahia 2026", savedAt: "2026-10-10T12:00:00.000Z", date: "2026-01-03", season: 2026, coachClubId: "bahia-ba" },
  ]);
});

test("loading a slot puts its game back in the engine", async () => {
  const engine = startEngine();
  const slots = indexedDbSlots(new IDBFactory());
  await engine.newGame(7, { coachClubId: "bahia-ba" });
  await saveToSlot(engine, slots, { id: "slot-1", name: "Bahia 2026" }, new Date("2026-10-10T12:00:00Z"));
  await engine.advance([{}, {}, {}]);
  expect(await loadFromSlot(engine, slots, "slot-1")).toEqual({ date: "2026-01-01", season: 2026, coachClubId: "bahia-ba" });
  expect(await engine.read(["date"])).toEqual({ date: "2026-01-01" });
});
