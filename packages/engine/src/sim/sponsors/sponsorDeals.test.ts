import { describe, expect, it } from "vitest";
import type { Brand, ShirtDeal } from "@boleiro/data/sponsors";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { clubMood } from "../morale/clubMood.js";
import { runSponsorDay, sendSponsorOffers, signSponsorOffer, type SponsorEvent } from "./sponsorDeals.js";
import { seedSponsors, type ClubSponsors, type SponsorFiles } from "./sponsors.js";

const MI = 1_000_000;
const COACH = "botafogo-rj";
const brand = (id: string, sector: string, size: Brand["size"], isPool = true): Brand => ({ id, name: id.toUpperCase(), sector, size, isPool });
const deal = (clubId: string, slot: ShirtDeal["slot"], brandId: string, untilSeason: number | null = 2028): ShirtDeal => ({
  clubId, slot, rank: 0, brandId, yearly: null, untilSeason, valueSource: "", source: "https://en.wikipedia.org/w/index.php?oldid=1",
});

const FILES: SponsorFiles = {
  brands: [
    brand("bigbank", "bank", "giant"), brand("bank", "bank", "large"), brand("shop", "retail", "large"), brand("food", "food", "large"),
    brand("airline", "airline", "medium"), brand("bet", "betting", "large"), brand("othersbet", "betting", "large"),
    brand("smallbet", "betting", "medium"), brand("tinybet", "betting", "small"), brand("corner", "retail", "small"), brand("kitsmall", "kit", "small"),
    brand("kitco", "kit", "large"), brand("kitone", "kit", "medium"), brand("vbet", "betting", null, false), brand("mizuno", "kit", null, false),
  ],
  deals: [deal(COACH, "master", "vbet"), deal(COACH, "kit", "mizuno")],
};

function game(overrides: Partial<GameState> = {}): GameState {
  const start = loadNewGame(3, { coachClubId: COACH });
  const { sponsors, pool } = seedSponsors(start, FILES);
  return { ...start, sponsors, sponsorPool: pool, ...overrides };
}

const own = (state: GameState): ClubSponsors => {
  const sponsors = state.sponsors?.[COACH];
  if (!sponsors) throw new Error("no sponsors for the coach's club");
  return sponsors;
};

describe("sponsor offers", () => {
  it("brings brands that want the empty places on the coach's kit, each with a value, a length and a day the board decides", () => {
    const offered = own(sendSponsorOffers(game()).state);
    expect(offered.offers.length).toBeGreaterThan(0);
    for (const offer of offered.offers) {
      expect(["master", "kit"]).not.toContain(offer.slot);
      expect(offer.yearly).toBeGreaterThan(0);
      expect(offer.years).toBeGreaterThanOrEqual(1);
      expect(offer.decideBy > game().date).toBe(true);
    }
  });

  it("brings no offers for an AI club", () => {
    const sent = sendSponsorOffers(game());
    for (const [clubId, sponsors] of Object.entries(sent.state.sponsors ?? {})) if (clubId !== COACH) expect(sponsors.offers).toEqual([]);
  });

  it("puts the brand the coach picks on his kit at once, moves the money into the club's sponsorship and drops the other offers for that place", () => {
    const offered = sendSponsorOffers(game()).state;
    const offer = own(offered).offers[0];
    if (!offer) throw new Error("no offer");
    const signed = signSponsorOffer(offered, COACH, offer.id);
    const contract = own(signed).contracts.find((c) => c.slot === offer.slot);
    expect(contract).toMatchObject({ brandId: offer.brandId, yearly: offer.yearly, untilSeason: offered.season - 1 + offer.years, basis: "game" });
    expect(signed.finances[COACH]?.sponsorship).toBe((offered.finances[COACH]?.sponsorship ?? 0) + offer.yearly);
    expect(own(signed).offers.filter((o) => o.slot === offer.slot)).toEqual([]);
  });

  it("moves the old brand to the club's past deals when an offer replaces it, and takes only the difference out of the sponsorship", () => {
    const start = game();
    const master = own(start).contracts.find((c) => c.slot === "master");
    if (!master) throw new Error("no master");
    const offer = { id: "o1", slot: "master" as const, brandId: "bigbank", brandName: "BIGBANK", isBetting: false, yearly: master.yearly + 5 * MI, years: 2, decideBy: "2026-02-01" };
    const withOffer = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), offers: [offer] } } };
    const signed = signSponsorOffer(withOffer, COACH, "o1");
    expect(signed.finances[COACH]?.sponsorship).toBe((start.finances[COACH]?.sponsorship ?? 0) + 5 * MI);
    expect(own(signed).past).toEqual([{ slot: "master", brandId: master.brandId, brandName: master.brandName, yearly: master.yearly, endedOn: start.date, reason: "replaced" }]);
  });

  it("replaces only the first brand of a place two brands share, and takes only its money out", () => {
    const start = game();
    const fronts = [
      { slot: "front" as const, brandId: "one", brandName: "ONE", isBetting: false, yearly: 3 * MI, untilSeason: 2028, isEndKnown: true, basis: "estimate" as const },
      { slot: "front" as const, brandId: "two", brandName: "TWO", isBetting: false, yearly: 2 * MI, untilSeason: 2028, isEndKnown: true, basis: "estimate" as const },
    ];
    const offer = { id: "o1", slot: "front" as const, brandId: "bank", brandName: "BANK", isBetting: false, yearly: 5 * MI, years: 2, decideBy: "2026-02-01" };
    const withFronts = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), contracts: [...own(start).contracts, ...fronts], offers: [offer] } } };
    const signed = signSponsorOffer(withFronts, COACH, "o1");
    expect(own(signed).contracts.filter((c) => c.slot === "front").map((c) => c.brandId).sort()).toEqual(["bank", "two"]);
    expect(signed.finances[COACH]?.sponsorship).toBe((start.finances[COACH]?.sponsorship ?? 0) + 2 * MI);
    expect(own(signed).past.map((p) => p.brandId)).toEqual(["one"]);
  });

  it("costs a little fan mood to put a betting house on the kit in place of another brand, and gives it back when it leaves", () => {
    const start = game();
    const swap = (state: GameState, brandId: string, isBetting: boolean) => {
      const offer = { id: brandId, slot: "master" as const, brandId, brandName: brandId, isBetting, yearly: 10 * MI, years: 1, decideBy: "2026-02-01" };
      return signSponsorOffer({ ...state, sponsors: { ...state.sponsors, [COACH]: { ...own(state), offers: [offer] } } }, COACH, brandId);
    };
    const clean = swap(start, "bigbank", false);
    const betting = swap(clean, "bet", true);
    expect(clubMood(betting, COACH).fans).toBe(clubMood(clean, COACH).fans - 2);
    expect(clubMood(swap(betting, "bank", false), COACH).fans).toBe(clubMood(clean, COACH).fans);
  });

  it("refuses an offer the coach's club doesn't have", () => {
    expect(() => signSponsorOffer(game(), COACH, "nope")).toThrow(/offer/);
  });
});

describe("the sponsors' day", () => {
  const atDecision = (picksSponsors: boolean) => {
    const offered = sendSponsorOffers(game()).state;
    const decideBy = own(offered).offers[0]?.decideBy ?? "";
    const before = { ...offered, coach: { ...offered.coach, ...(picksSponsors ? { picksSponsors: true as const } : {}) } };
    return { before, after: runSponsorDay(before, { ...before, date: decideBy }) };
  };

  it("has the board sign the best offer for each place on its day when it negotiates", () => {
    const { before, after } = atDecision(false);
    const offers = own(before).offers;
    const slots = [...new Set(offers.map((o) => o.slot))];
    for (const slot of slots) {
      const best = offers.filter((o) => o.slot === slot).reduce((a, b) => (b.yearly > a.yearly ? b : a));
      expect(own(after.state).contracts.find((c) => c.slot === slot)?.brandId).toBe(best.brandId);
    }
    expect(own(after.state).offers).toEqual([]);
    expect(after.events.some((e: SponsorEvent) => e.type === "sponsorSigned" && e.byBoard)).toBe(true);
  });

  it("has the board keep a deal in its last season that pays more than every offer, to renew it at the turn", () => {
    const start = game();
    const contracts = own(start).contracts.map((c) => (c.slot === "master" ? { ...c, yearly: 500 * MI, untilSeason: start.season } : c));
    const ending = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), contracts } }, date: `${start.season}-09-30` };
    const offered = runSponsorDay(ending, { ...ending, date: `${start.season}-10-01` }).state;
    const decideBy = own(offered).offers.find((o) => o.slot === "master")?.decideBy ?? "";
    const decided = runSponsorDay(offered, { ...offered, date: decideBy }).state;
    expect(own(decided).contracts.find((c) => c.slot === "master")).toMatchObject({ brandId: "vbet", yearly: 500 * MI });
  });

  it("lets the offers lapse on their day when the coach picks his sponsors himself", () => {
    const { before, after } = atDecision(true);
    expect(own(after.state).offers).toEqual([]);
    expect(own(after.state).contracts).toEqual(own(before).contracts);
    expect(after.state.finances[COACH]?.sponsorship).toBe(before.finances[COACH]?.sponsorship);
  });

  it("follows each hot-seat coach's own choice: the waiting coach who picks keeps his offers while the seated coach's board signs", () => {
    const start = loadNewGame(3, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "flamengo-rj" }] } });
    const { sponsors, pool } = seedSponsors(start, { ...FILES, deals: [...FILES.deals, deal("flamengo-rj", "master", "bet"), deal("flamengo-rj", "kit", "kitco")] });
    const offered = sendSponsorOffers({ ...start, sponsors, sponsorPool: pool }).state;
    const waiting = offered.waitingCoaches?.map((coach) => ({ ...coach, coach: { ...coach.coach, picksSponsors: true as const } }));
    const before = { ...offered, ...(waiting ? { waitingCoaches: waiting } : {}) };
    const decideBy = own(before).offers[0]?.decideBy ?? "";
    expect(before.sponsors?.["flamengo-rj"]?.offers.length).toBeGreaterThan(0);
    const after = runSponsorDay(before, { ...before, date: decideBy }).state;
    expect(after.sponsors?.["flamengo-rj"]?.contracts).toEqual(before.sponsors?.["flamengo-rj"]?.contracts);
    expect(own(after).contracts).not.toEqual(own(before).contracts);
  });

  it("brings offers for a deal in its last season on the first of October", () => {
    const start = game();
    const ending = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), contracts: own(start).contracts.map((c) => (c.slot === "master" ? { ...c, untilSeason: start.season } : c)) } } };
    const day = runSponsorDay({ ...ending, date: `${start.season}-09-30` }, { ...ending, date: `${start.season}-10-01` });
    expect(own(day.state).offers.some((o) => o.slot === "master")).toBe(true);
  });

  it("renews or replaces every ended deal at the season's turn at the same value, a betting house by another", () => {
    const start = game();
    const ended = Object.fromEntries(Object.entries(start.sponsors ?? {}).map(([id, s]) => [id, { ...s, contracts: s.contracts.map((c) => ({ ...c, untilSeason: start.season })) }]));
    const before = { ...start, sponsors: ended, date: `${start.season}-12-31` };
    const turned = runSponsorDay(before, { ...before, season: start.season + 1, date: `${start.season + 1}-01-01` }).state;
    for (const [clubId, sponsors] of Object.entries(turned.sponsors ?? {})) {
      const was = ended[clubId]?.contracts ?? [];
      expect(sponsors.contracts.map((c) => c.yearly), clubId).toEqual(was.map((c) => c.yearly));
      expect(sponsors.contracts.map((c) => c.isBetting), clubId).toEqual(was.map((c) => c.isBetting));
      for (const contract of sponsors.contracts) expect(contract.untilSeason).toBeGreaterThan(start.season);
    }
    expect(turned.finances).toStrictEqual(before.finances);
  });

  it("rotates AI clubs' brands over the seasons without ever swapping a betting house for another kind of brand", () => {
    let state = game();
    const start = state.sponsors ?? {};
    const first = state.season;
    for (let season = first; season < first + 10; season++) {
      const ending = Object.fromEntries(Object.entries(state.sponsors ?? {}).map(([id, s]) => [id, { ...s, contracts: s.contracts.map((c) => ({ ...c, untilSeason: season })) }]));
      const before = { ...state, sponsors: ending, season, date: `${season}-12-31` };
      state = runSponsorDay(before, { ...before, season: season + 1, date: `${season + 1}-01-01` }).state;
    }
    const ai = Object.keys(start).filter((id) => id !== COACH);
    for (const clubId of ai) {
      expect(state.sponsors?.[clubId]?.contracts.map((c) => c.isBetting), clubId).toEqual(start[clubId]?.contracts.map((c) => c.isBetting));
    }
    expect(ai.filter((id) => state.sponsors?.[id]?.contracts[0]?.brandId !== start[id]?.contracts[0]?.brandId).length).toBeGreaterThan(0);
  });

  it("pays the title bonus of a deal that ends with the season it was won in", () => {
    const start = game();
    const contracts = own(start).contracts.map((c) => (c.slot === "master" ? { ...c, untilSeason: start.season, bonuses: { title: 2 * MI } } : c));
    const before = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), contracts } }, date: `${start.season}-12-31` };
    const after = { ...before, season: start.season + 1, date: `${start.season + 1}-01-01` };
    const turned = runSponsorDay(before, after, { "serie-a": { championId: COACH, promotedIds: [], relegatedIds: [] } });
    expect(turned.events).toContainEqual(expect.objectContaining({ type: "sponsorBonusPaid", clubId: COACH, amount: 2 * MI, reason: "title" }));
  });

  it("pays a deal's title bonus when the coach's club wins its league", () => {
    const start = game();
    const contracts = own(start).contracts.map((c) => (c.slot === "master" ? { ...c, bonuses: { title: 2 * MI } } : c));
    const before = { ...start, sponsors: { ...start.sponsors, [COACH]: { ...own(start), contracts } }, date: `${start.season}-12-31` };
    const after = { ...before, season: start.season + 1, date: `${start.season + 1}-01-01` };
    const champion = runSponsorDay(before, after, { "serie-a": { championId: COACH, promotedIds: [], relegatedIds: [] } }).state;
    const runnerUp = runSponsorDay(before, after, { "serie-a": { championId: "palmeiras-sp", promotedIds: [], relegatedIds: [] } }).state;
    expect((champion.finances[COACH]?.cash ?? 0) - (runnerUp.finances[COACH]?.cash ?? 0)).toBe(2 * MI);
  });
});
