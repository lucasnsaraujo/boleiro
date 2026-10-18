import { expect, test } from "vitest";
import { doMomentsInterrupt, E2E_MOMENTS_KEY } from "./momentsGate.js";

const store = (value: string | null) => ({ getItem: (key: string) => (key === E2E_MOMENTS_KEY ? value : null) });

test("moments always interrupt in the game, and in an e2e build only when the test asks", () => {
  expect(doMomentsInterrupt(store(null), false)).toBe(true);
  expect(doMomentsInterrupt(store(null), true)).toBe(false);
  expect(doMomentsInterrupt(store("1"), true)).toBe(true);
});
