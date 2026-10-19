import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, expect, test, vi } from "vitest";
import { indexedDbSlots } from "./indexedDbSlots.js";
import type { SlotMeta } from "./slotMeta.js";

function meta(id: string, coachName: string, savedAt: string): SlotMeta {
  return { id, gameSlotId: id, coachName, savedAt, date: "2026-03-01", season: 2026, coachClubId: "bahia-ba", division: "A" };
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

const SAVED_AT = "2026-10-10T12:00:00.000Z";
const FIRST = { game: "game-1", world: "[\"aa\",\"bb\"]", "country-aa": "aa-1", "country-bb": "bb-1", session: "session-1" };
const SECOND = { ...FIRST, game: "game-2", "country-aa": "aa-2", session: "session-2" };

/** Watches the shards put into the store from now on; the returned function lists their keys in order. */
function watchShardsPut(): () => unknown[] {
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  return () =>
    put.mock.calls.flatMap((args, call) => {
      const store = put.mock.contexts[call];
      return store instanceof IDBObjectStore && store.name === "shards" ? [args[1]] : [];
    });
}

afterEach(() => vi.restoreAllMocks());

test("a save in shards reads back shard by shard", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-1", "Bahia 2026", SAVED_AT), FIRST);
  expect(await slots.read("slot-1")).toEqual(FIRST);
});

test("saving a slot again puts only the shards that changed since its last save", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("autosave", "Tite", SAVED_AT), FIRST);
  const shardsPut = watchShardsPut();
  await slots.write(meta("autosave", "Tite", SAVED_AT), SECOND);
  expect(shardsPut()).toEqual([
    ["autosave", "game"],
    ["autosave", "country-aa"],
    ["autosave", "session"],
  ]);
  expect(await slots.read("autosave")).toEqual(SECOND);
});

test("a shard the next save no longer has is not read back", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-1", "Tite", SAVED_AT), FIRST);
  await slots.write(meta("slot-1", "Tite", SAVED_AT), { game: "game-2", session: "session-2" });
  expect(await slots.read("slot-1")).toEqual({ game: "game-2", session: "session-2" });
});

test("a write cut off after its first shard leaves the previous save and its meta whole", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  const before = meta("autosave", "Tite", SAVED_AT);
  await slots.write(before, FIRST);
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
    const request = put.apply(this, args);
    this.transaction.abort();
    return request;
  });
  await expect(slots.write(meta("autosave", "Tite", "2026-10-10T12:05:00.000Z"), SECOND)).rejects.toThrow();
  expect(await slots.read("autosave")).toEqual(FIRST);
  expect(await slots.list()).toEqual([before]);
});

test("a removed save in shards can no longer be read", async () => {
  const slots = indexedDbSlots(new IDBFactory());
  await slots.write(meta("slot-1", "Tite", SAVED_AT), FIRST);
  await slots.remove("slot-1");
  expect(await slots.list()).toEqual([]);
  await expect(slots.read("slot-1")).rejects.toThrow("no save in slot slot-1");
});
