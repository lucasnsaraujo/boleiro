import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
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
