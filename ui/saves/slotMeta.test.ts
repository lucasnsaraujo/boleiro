import { expect, test } from "vitest";
import { gameSlots, slotLabel, toSlotMeta, type SlotMeta } from "./slotMeta.js";

const saved: SlotMeta = {
  id: "slot-2",
  savedAt: "2026-10-10T12:00:00.000Z",
  coachName: "Tite",
  date: "2026-03-01",
  season: 2026,
  coachClubId: "bahia-ba",
  division: "A",
};

test("the three game slots come in order, empty unless a game is saved there", () => {
  expect(gameSlots([saved])).toEqual([
    { id: "slot-1", label: "Jogo 1", meta: null },
    { id: "slot-2", label: "Jogo 2", meta: saved },
    { id: "slot-3", label: "Jogo 3", meta: null },
  ]);
});

test("the autosave slot is labelled as automatic and never offered for a new game", () => {
  expect(slotLabel("autosave")).toBe("Automático");
  expect(gameSlots([{ ...saved, id: "autosave" }]).every((slot) => slot.meta === null)).toBe(true);
});

test("slot metadata without a coach name or with an unknown division is dropped", () => {
  expect(toSlotMeta(saved)).toEqual(saved);
  expect(toSlotMeta({ ...saved, coachName: undefined })).toBeNull();
  expect(toSlotMeta({ ...saved, division: "E" })).toBeNull();
  expect(toSlotMeta({ ...saved, coachClubId: null, division: null })).toEqual({ ...saved, coachClubId: null, division: null });
});
