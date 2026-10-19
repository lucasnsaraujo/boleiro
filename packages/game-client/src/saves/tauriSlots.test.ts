import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { hashShards } from "./hashShards.js";
import type { SlotMeta } from "./slotMeta.js";
import { tauriSlots } from "./tauriSlots.js";

afterEach(() => clearMocks());

const SAVED: SlotMeta = {
  id: "slot-1",
  gameSlotId: "slot-1",
  coachName: "Bahia 2026",
  savedAt: "2026-10-10T12:00:00.000Z",
  date: "2026-03-01",
  season: 2026,
  coachClubId: "bahia-ba",
  division: "A",
};

test("a meta file that is not JSON is skipped and the other saves still list", async () => {
  mockIPC((command) => (command === "list_slots" ? ["{\"id\":\"slot-2\",", JSON.stringify(SAVED)] : null));
  expect(await tauriSlots().list()).toEqual([SAVED]);
});

const FIRST = { game: "game-1", world: "[\"aa\",\"bb\"]", "country-aa": "aa-1", "country-bb": "bb-1", session: "session-1" };
const SECOND = { ...FIRST, game: "game-2", "country-aa": "aa-2", session: "session-2" };

type Call = { command: string; payload: unknown };

function hashesSent(payload: unknown): Record<string, string> {
  if (typeof payload !== "object" || payload === null || !("hashes" in payload)) throw new Error("a write in shards sends the hashes");
  const { hashes } = payload;
  if (typeof hashes !== "object" || hashes === null) throw new Error("the hashes come by shard name");
  return Object.fromEntries(Object.entries(hashes).map(([name, hash]) => [name, String(hash)]));
}

/** Answers the desktop's commands for a slot holding a save in shards with these hashes, or none; keeps every call in order. */
function desktopHolding(held: Record<string, string> | null): Call[] {
  const calls: Call[] = [];
  mockIPC(async (command, payload) => {
    calls.push({ command, payload });
    if (command === "slot_shard_hashes") return held;
    if (command === "write_slot_shards") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      held = hashesSent(payload);
      calls.push({ command: "written", payload: null });
    }
    return null;
  });
  return calls;
}

test("a save in shards sends the desktop only the shards whose hash differs from the slot's", async () => {
  const calls = desktopHolding(await hashShards(FIRST));
  await tauriSlots().write(SAVED, SECOND);
  expect(calls.find((call) => call.command === "write_slot_shards")?.payload).toEqual({
    id: "slot-1",
    meta: JSON.stringify(SAVED),
    hashes: await hashShards(SECOND),
    changed: { game: "game-2", "country-aa": "aa-2", session: "session-2" },
  });
});

test("a slot without a save in shards, empty or written whole, gets every shard", async () => {
  const calls = desktopHolding(null);
  await tauriSlots().write(SAVED, FIRST);
  expect(calls.find((call) => call.command === "write_slot_shards")?.payload).toMatchObject({ changed: FIRST });
});

test("writes asked for at once go one at a time, each compared with the save written before it", async () => {
  const calls = desktopHolding(null);
  const slots = tauriSlots();
  await Promise.all([slots.write(SAVED, FIRST), slots.write(SAVED, SECOND)]);
  expect(calls.map((call) => call.command)).toEqual(["slot_shard_hashes", "write_slot_shards", "written", "slot_shard_hashes", "write_slot_shards", "written"]);
  expect(calls[4]?.payload).toMatchObject({ changed: { game: "game-2", "country-aa": "aa-2", session: "session-2" } });
});
