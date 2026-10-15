import { expect, test } from "vitest";
import { loadNewGame, newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { loadEurope } from "@boleiro/engine/sim/world/loadEurope";
import { loadSouthAmerica } from "@boleiro/engine/sim/world/loadSouthAmerica";
import { bundledGameFiles } from "./bundledGameFiles.js";

test("a game built from the bundled files equals one loaded from disk with South America, Europe and the same seed", () => {
  const options = { coachClubId: "bahia-ba" };
  expect(newGameFromFiles(2026, options, bundledGameFiles)).toEqual(loadNewGame(2026, { ...options, world: [...loadSouthAmerica(2026), ...loadEurope(2026)] }));
});
