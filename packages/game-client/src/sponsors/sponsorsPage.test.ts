import { expect, test } from "vitest";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { BETTING_FAN_COST, signSponsorOffer } from "@boleiro/engine/sim/sponsors/sponsorDeals";
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

test("the page tells what taking a betting house off would give the fans back: all of a fresh cost, none for one the data put on the kit", () => {
  const game = loadNewGame(5, { coachClubId: CLUB });
  const sponsors = game.sponsors?.[CLUB];
  const master = sponsors?.contracts.find((c) => c.slot === "master");
  if (!sponsors || !master) throw new Error("Botafogo has no master");
  expect(sponsorsPageOf(game)?.fanCostLeft).toBe(0);
  const clean: SponsorOffer = { id: "clean", slot: "master", brandId: "itau", brandName: "Itaú", isBetting: false, yearly: master.yearly, years: 2, decideBy: "2026-02-01", replacesBrandId: master.brandId, placeValue: master.yearly };
  const cleaned = signSponsorOffer({ ...game, sponsors: { ...game.sponsors, [CLUB]: { ...sponsors, offers: [clean] } } }, CLUB, "clean");
  const bet: SponsorOffer = { ...clean, id: "bet", brandId: "betano", brandName: "Betano", isBetting: true, replacesBrandId: "itau" };
  const kit = cleaned.sponsors?.[CLUB];
  if (!kit) throw new Error("Botafogo lost its sponsors");
  const betting = signSponsorOffer({ ...cleaned, sponsors: { ...cleaned.sponsors, [CLUB]: { ...kit, offers: [bet] } } }, CLUB, "bet");
  expect(sponsorsPageOf(betting)?.fanCostLeft).toBe(BETTING_FAN_COST);
});
