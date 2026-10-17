import { expect, test } from "vitest";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import type { SponsorContract, SponsorOffer } from "@boleiro/engine/sim/sponsors/sponsors";
import { sponsorsPageOf } from "./sponsorsPage.js";

const CLUB = "botafogo-rj";
const MI = 1_000_000;

test("an offer for a place two brands share names the brand whose deal it would replace, not the place's first", () => {
  const game = loadNewGame(5, { coachClubId: CLUB });
  const sponsors = game.sponsors?.[CLUB];
  if (!sponsors) throw new Error("Botafogo has no sponsors");
  const front = (brandId: string, untilSeason: number): SponsorContract => ({ slot: "front", brandId, brandName: brandId.toUpperCase(), isBetting: false, yearly: 2 * MI, untilSeason, isEndKnown: true, basis: "estimate" });
  const offer: SponsorOffer = { id: "o1", slot: "front", brandId: "bank", brandName: "BANK", isBetting: false, yearly: 3 * MI, years: 2, decideBy: "2026-11-01", replacesBrandId: "two", placeValue: 2 * MI };
  const state = { ...game, sponsors: { ...game.sponsors, [CLUB]: { ...sponsors, contracts: [...sponsors.contracts, front("one", 2028), front("two", 2026)], offers: [offer] } } };
  expect(sponsorsPageOf(state)?.offers).toEqual([expect.objectContaining({ id: "o1", replaces: "TWO" })]);
});
