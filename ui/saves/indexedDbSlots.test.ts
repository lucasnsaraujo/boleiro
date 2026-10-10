import { IDBFactory } from "fake-indexeddb";
import { expect, test } from "vitest";
import { indexedDbSlots } from "./indexedDbSlots.js";
import type { SlotMeta } from "./slotMeta.js";

function meta(id: string, name: string, savedAt: string): SlotMeta {
  return { id, name, savedAt, date: "2026-03-01", season: 2026, coachClubId: "bahia-ba" };
}

test("a written slot is listed and its save reads back", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-1", "Bahia 2026", "2026-10-10T12:00:00.000Z"), "{\"save\":1}");
  expect(await slots.list()).toEqual([meta("slot-1", "Bahia 2026", "2026-10-10T12:00:00.000Z")]);
  expect(await slots.read("slot-1")).toBe("{\"save\":1}");
});

test("writing a slot again replaces it", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("autosave", "Autosave", "2026-10-10T12:00:00.000Z"), "old");
  await slots.write(meta("autosave", "Autosave", "2026-10-10T12:05:00.000Z"), "new");
  expect(await slots.list()).toHaveLength(1);
  expect(await slots.read("autosave")).toBe("new");
});

test("slots are listed newest first", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-a", "Antigo", "2026-10-01T12:00:00.000Z"), "a");
  await slots.write(meta("slot-b", "Novo", "2026-10-09T12:00:00.000Z"), "b");
  expect((await slots.list()).map((slot) => slot.id)).toEqual(["slot-b", "slot-a"]);
});

test("a removed slot leaves the list and can no longer be read", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-1", "Bahia 2026", "2026-10-10T12:00:00.000Z"), "save");
  await slots.remove("slot-1");
  expect(await slots.list()).toEqual([]);
  await expect(slots.read("slot-1")).rejects.toThrow("no save in slot slot-1");
});

test("a slot id that could escape the saves folder is refused", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await expect(slots.write(meta("../x", "Fora", "2026-10-10T12:00:00.000Z"), "save")).rejects.toThrow("invalid slot id");
});
