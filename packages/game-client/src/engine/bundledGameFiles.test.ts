import { expect, test } from "vitest";
import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { loadNewGame, newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { loadEurope } from "@boleiro/engine/sim/world/loadEurope";
import { loadGuests } from "@boleiro/engine/sim/world/loadGuests";
import { loadMarketLeagues } from "@boleiro/engine/sim/world/loadMarketLeagues";
import { loadSouthAmerica } from "@boleiro/engine/sim/world/loadSouthAmerica";
import { bundledGameFiles } from "./bundledGameFiles.js";

test("a game built from the bundled files equals one loaded from disk with the whole world, the Club World Cup's guests, the national teams and the same seed", () => {
  const options = { coachClubId: "bahia-ba" };
  expect(newGameFromFiles(2026, options, bundledGameFiles)).toEqual(loadNewGame(2026, { ...options, world: [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)], guests: loadGuests(2026), nationalFootball: loadNationalFootball() }));
});
