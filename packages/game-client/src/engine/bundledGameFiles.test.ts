import { expect, test } from "vitest";
import { loadNewGame, newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "./bundledGameFiles.js";

test("a game built from the bundled files equals one loaded from disk with the same seed", () => {
  const options = { coachClubId: "bahia-ba" };
  expect(newGameFromFiles(2026, options, bundledGameFiles)).toEqual(loadNewGame(2026, options));
});
