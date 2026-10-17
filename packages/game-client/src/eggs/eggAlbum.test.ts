import { EGG_BANK } from "@boleiro/engine/sim/eggs/eggBank";
import { expect, test } from "vitest";
import { eggAlbumOf } from "./eggAlbum.js";

test("the album shows each egg found once, oldest first, out of every egg in the game", () => {
  const log = [
    { eggId: "sobrenatural", date: "2026-03-01", clubId: "a", fixtureId: "f1", headline: "Trave, trave, trave" },
    { eggId: "seven-one", date: "2026-04-01", clubId: "a", fixtureId: "f2", headline: "Sete a um" },
    { eggId: "sobrenatural", date: "2026-05-01", clubId: "a", fixtureId: "f3", headline: "De novo" },
  ];
  const album = eggAlbumOf({ eggs: { log } });
  expect(album.found.map((sticker) => [sticker.eggId, sticker.date, sticker.headline, sticker.times])).toEqual([
    ["sobrenatural", "2026-03-01", "Trave, trave, trave", 2],
    ["seven-one", "2026-04-01", "Sete a um", 1],
  ]);
  expect(album.found[1]).toMatchObject({ title: "Sete a um", look: "page", rarity: "legendary", number: EGG_BANK.findIndex((egg) => egg.id === "seven-one") + 1 });
  expect(album.total).toBe(EGG_BANK.length);
  expect(eggAlbumOf({}).found).toEqual([]);
});
