import { expect, test } from "vitest";
import { seatLayoutOf } from "./seatLayout.js";

test("the human coaches' boards stand side by side when each gets at least 360 px, else one is in focus", () => {
  expect(seatLayoutOf(1240, 2)).toBe("sideBySide");
  expect(seatLayoutOf(1240, 3)).toBe("sideBySide");
  expect(seatLayoutOf(1240, 4)).toBe("focus");
  expect(seatLayoutOf(734, 2)).toBe("sideBySide");
  expect(seatLayoutOf(733, 2)).toBe("focus");
});

test("before the band has been measured the boards stand side by side", () => {
  expect(seatLayoutOf(0, 4)).toBe("sideBySide");
});
