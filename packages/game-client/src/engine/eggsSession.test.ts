import { expect, test } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const CLUB = "flamengo-rj";

test("typing BRASFOOT in a game is told to the game once: a rarity line in the inbox and a sticker in the album", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices: { coachClubId: CLUB } });
  const found = session.apply({ type: "findEgg", eggId: "windows-98" });
  expect(found).toMatchObject({ eggId: "windows-98", clubId: CLUB, look: "sticker" });
  expect(session.inbox()[0]?.text).toBe(`Raridade: ${found?.headline}`);
  expect(session.eggAlbum().found.map((sticker) => sticker.eggId)).toEqual(["windows-98"]);
  expect(session.apply({ type: "findEgg", eggId: "windows-98" })).toBeNull();
  expect(session.eggAlbum().found).toHaveLength(1);
});

test("a one-coach game keeps the name typed at new game for the eggs", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices: { coachClubId: CLUB, coachName: "Tite" } });
  expect(session.read(["eggs"]).eggs?.coachName).toBe("Tite");
});
