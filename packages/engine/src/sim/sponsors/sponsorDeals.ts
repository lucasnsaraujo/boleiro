import { SPONSOR_SLOTS, isBettingBrand, type SponsorSlot } from "@boleiro/data/sponsors";
import { addDays } from "../dates.js";
import type { ClubFinance, GameState, IsoDate } from "../gameState.js";
import { humanClubIds, waitingCoachesOf } from "../coach/humanCoaches.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { clubMood } from "../morale/clubMood.js";
import {
  brandsForSlot,
  clubSizeOf,
  dealYears,
  OFF_KIT_SHARE,
  pickOne,
  roundDeal,
  SLOT_SHARE,
  sponsorStream,
  type ClubSponsors,
  type DealBonuses,
  type PoolBrand,
  type SponsorContract,
  type SponsorFiles,
  type SponsorOffer,
  seedSponsors,
} from "./sponsors.js";

export type SponsorEvent =
  | { type: "sponsorOffers"; clubId: string; count: number }
  | { type: "sponsorSigned"; clubId: string; slot: SponsorSlot; brandName: string; yearly: number; years: number; byBoard: boolean }
  | { type: "sponsorBonusPaid"; clubId: string; brandName: string; amount: number; reason: "title" | "continental" };

// guess: the board decides on offers at a monthly closing, the first at least two weeks after they come,
// once the month's money is settled.
const OFFER_DAYS = 14;
// guess: offers for a deal in its last season come on 1 October.
const RENEWAL_OFFERS_ON = "10-01";
// guess: how many brands bid for a place: three for the master, two for the kit maker, one or two elsewhere.
const OFFERS_PER_SLOT: Record<SponsorSlot, [number, number]> = { master: [3, 3], kit: [2, 2], front: [1, 2], back: [1, 2], sleeves: [1, 2], shorts: [1, 1], socks: [1, 1], number: [1, 1] };
// guess: a brand bids within a sixth below and a fifth above its size's going rate.
const OFFER_SPREAD = [0.85, 1.2] as const;
const SIZE_PREMIUM = { giant: 1.15, large: 1, medium: 0.9, small: 0.8 } as const;
// guess: a betting house outbids the rest by about a third (Betano pays Flamengo far more than any brand
// outside betting would; the approved mock's "R$ 150 mi a mais" is that one deal).
const BETTING_PREMIUM = 1.35;
/** Fan mood a betting house on the kit costs while it stays there (approved sponsors mock: "Torcida −2%"). */
export const BETTING_FAN_COST = 2;
// guess: a game deal pays a tenth of its yearly value for a title and a twentieth for a continental place.
const TITLE_BONUS_SHARE = 0.1;
const CONTINENTAL_BONUS_SHARE = 0.05;
// guess: two in five of the brands that bid offer a title or continental bonus on top.
const BONUS_CHANCE = 0.4;
// guess: a title or a continental place makes two brands bid for the kit's places, a quarter above the rate.
const BIG_RESULT_OFFERS = 2;
const BIG_RESULT_PREMIUM = 1.25;

/** The first monthly closing at least two weeks after `date`, when the board decides on an offer that came then. */
function boardMeetingAfter(date: IsoDate): IsoDate {
  const earliest = addDays(date, OFFER_DAYS);
  const [year = 0, month = 1, day = 1] = earliest.split("-").map(Number);
  if (day === 1) return earliest;
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

const sponsorsOf = (state: Pick<GameState, "sponsors">, clubId: string): ClubSponsors => state.sponsors?.[clubId] ?? { contracts: [], offers: [], past: [] };

function withClubSponsors(state: GameState, clubId: string, sponsors: ClubSponsors): GameState {
  return { ...state, sponsors: { ...state.sponsors, [clubId]: sponsors } };
}

function withFinance(state: GameState, clubId: string, change: (finance: ClubFinance) => ClubFinance): GameState {
  const finance = state.finances[clubId];
  return finance ? { ...state, finances: { ...state.finances, [clubId]: change(finance) } } : state;
}

/** Whether a club's kit shows a betting house in any place. */
const hasBettingSponsor = (sponsors: Pick<ClubSponsors, "contracts">): boolean => sponsors.contracts.some((c) => c.isBetting);

function withFans(state: GameState, clubId: string, change: number): GameState {
  if (change === 0) return state;
  const mood = clubMood(state, clubId);
  return { ...state, mood: { ...state.mood, [clubId]: { ...mood, fans: Math.min(100, Math.max(0, mood.fans + change)) } } };
}

/** A place on a club's kit brands bid for: an empty one, or one whose deal `replaces` they would take over. */
type Place = { slot: SponsorSlot; replaces?: SponsorContract };

/**
 * What an empty place pays a club today: its share, by Flamengo's places, of the sponsorship no deal holds,
 * split with the other empty places and the money that stays off the kit. The deals are a breakdown of the
 * club's sponsorship, so a brand that takes the place takes this money over rather than adding to it.
 */
function emptyPlaceValue(state: GameState, clubId: string, slot: SponsorSlot): number {
  const { contracts } = sponsorsOf(state, clubId);
  const free = Math.max(0, (state.finances[clubId]?.sponsorship ?? 0) - contracts.reduce((sum, c) => sum + c.yearly, 0));
  const emptyShare = SPONSOR_SLOTS.filter((s) => !contracts.some((c) => c.slot === s)).reduce((sum, s) => sum + SLOT_SHARE[s], 0);
  return Math.round((free * SLOT_SHARE[slot]) / (emptyShare + OFF_KIT_SHARE));
}

/**
 * The offers for `places` a club draws today, from the pool's brands that fit it and are not already on its
 * kit or bidding for it. A brand bids around what the place pays now (a betting house's deal without its premium), so the
 * board's choice moves the sponsorship only by what a better deal is worth.
 */
function drawOffers(state: GameState, clubId: string, places: readonly Place[], decideBy: IsoDate, premium = 1): SponsorOffer[] {
  const finance = state.finances[clubId];
  const pool: readonly PoolBrand[] = state.sponsorPool ?? [];
  if (!finance || !pool.length) return [];
  const random = sponsorStream(state.seed, `offers:${clubId}:${state.date}`);
  const size = clubSizeOf(finance.sponsorship);
  const { contracts, offers: offered } = sponsorsOf(state, clubId);
  const taken = new Set([...contracts, ...offered].map((deal) => deal.brandId));
  return places.flatMap(({ slot, replaces }) => {
    const placeValue = replaces ? replaces.yearly : emptyPlaceValue(state, clubId, slot);
    const going = replaces?.isBetting ? placeValue / BETTING_PREMIUM : placeValue;
    if (going <= 0) return [];
    const [low, high] = OFFERS_PER_SLOT[slot];
    const count = low + Math.floor(random() * (high - low + 1));
    const offers: SponsorOffer[] = [];
    for (let i = 0; i < count; i++) {
      const brand = pickOne(brandsForSlot(pool, slot, size).filter((b) => !taken.has(b.id)), random);
      if (!brand) break;
      taken.add(brand.id);
      const isBetting = isBettingBrand(brand);
      const spread = OFFER_SPREAD[0] + random() * (OFFER_SPREAD[1] - OFFER_SPREAD[0]);
      const yearly = roundDeal(going * SIZE_PREMIUM[brand.size] * spread * (isBetting ? BETTING_PREMIUM : 1) * premium);
      const bonusRoll = random();
      const bonuses: DealBonuses | undefined =
        bonusRoll < BONUS_CHANCE / 2 ? { title: roundDeal(yearly * TITLE_BONUS_SHARE) } : bonusRoll < BONUS_CHANCE ? { continental: roundDeal(yearly * CONTINENTAL_BONUS_SHARE) } : undefined;
      offers.push({
        id: `${state.date}:${slot}:${brand.id}`,
        slot,
        brandId: brand.id,
        brandName: brand.name,
        isBetting,
        yearly,
        years: dealYears(slot, random),
        ...(bonuses ? { bonuses } : {}),
        decideBy,
        ...(replaces ? { replacesBrandId: replaces.brandId } : {}),
        placeValue,
      });
    }
    return offers;
  });
}

function addOffers(state: GameState, clubId: string, offers: readonly SponsorOffer[], events: SponsorEvent[]): GameState {
  if (!offers.length) return state;
  events.push({ type: "sponsorOffers", clubId, count: offers.length });
  const sponsors = sponsorsOf(state, clubId);
  return withClubSponsors(state, clubId, { ...sponsors, offers: [...sponsors.offers, ...offers] });
}

const emptyPlaces = (sponsors: ClubSponsors): Place[] =>
  SPONSOR_SLOTS.filter((slot) => !sponsors.contracts.some((c) => c.slot === slot) && !sponsors.offers.some((o) => o.slot === slot)).map((slot) => ({ slot }));
/** Whether an offer bids for the same place as `other`: the same deal to replace, or the same empty place. */
const isSamePlace = (offer: SponsorOffer, other: Pick<SponsorOffer, "slot" | "replacesBrandId">): boolean => offer.slot === other.slot && offer.replacesBrandId === other.replacesBrandId;

/** Brands bid for the empty places on every human coach's kit: at the start of a game, or when he takes a club. */
export function sendSponsorOffers(state: GameState): { state: GameState; events: SponsorEvent[] } {
  const events: SponsorEvent[] = [];
  let next = state;
  for (const clubId of humanClubIds(state)) {
    next = addOffers(next, clubId, drawOffers(next, clubId, emptyPlaces(sponsorsOf(next, clubId)), boardMeetingAfter(state.date)), events);
  }
  return { state: next, events };
}

/** A game with every club's kit deals seeded from the data and the offers for its human coaches' empty places. */
export function seedGameSponsors(state: GameState, files: SponsorFiles): GameState {
  const { sponsors, pool } = seedSponsors(state, files);
  return sendSponsorOffers({ ...state, sponsors, sponsorPool: pool }).state;
}

/** The deal an offer would replace, while it is still on the kit. */
const replacedBy = (sponsors: ClubSponsors, offer: SponsorOffer): SponsorContract | undefined =>
  offer.replacesBrandId === undefined ? undefined : sponsors.contracts.find((c) => c.slot === offer.slot && c.brandId === offer.replacesBrandId);

/** What the place an offer bids for pays today: the deal it would replace, or the empty place's money. */
const placeValueOf = (sponsors: ClubSponsors, offer: SponsorOffer): number => replacedBy(sponsors, offer)?.yearly ?? offer.placeValue;

/**
 * A signed offer's brand goes on a club's kit in place of the deal it bid for (the others sharing the
 * place stay), with the other bids for that place: the sponsorship and the fans follow the difference.
 */
function putOnKit(state: GameState, clubId: string, offer: SponsorOffer): GameState {
  const sponsors = sponsorsOf(state, clubId);
  const old = replacedBy(sponsors, offer);
  const contract = contractOf(offer, state.season);
  const past = old ? [...sponsors.past, { slot: old.slot, brandId: old.brandId, brandName: old.brandName, yearly: old.yearly, endedOn: state.date, reason: "replaced" as const }] : sponsors.past;
  const contracts = [...sponsors.contracts.filter((c) => c !== old), contract].sort((a, b) => SPONSOR_SLOTS.indexOf(a.slot) - SPONSOR_SLOTS.indexOf(b.slot));
  const kept = { contracts, offers: sponsors.offers.filter((o) => !isSamePlace(o, offer)), past };
  const wasBetting = hasBettingSponsor(sponsors);
  const isBetting = hasBettingSponsor(kept);
  const gain = contract.yearly - placeValueOf(sponsors, offer);
  const moved = withFinance(withClubSponsors(state, clubId, kept), clubId, (f) => ({ ...f, sponsorship: f.sponsorship + gain }));
  return withFans(moved, clubId, wasBetting === isBetting ? 0 : isBetting ? -BETTING_FAN_COST : BETTING_FAN_COST);
}

function contractOf(offer: SponsorOffer, season: number): SponsorContract {
  return {
    slot: offer.slot,
    brandId: offer.brandId,
    brandName: offer.brandName,
    isBetting: offer.isBetting,
    yearly: offer.yearly,
    untilSeason: season - 1 + offer.years,
    isEndKnown: true,
    basis: "game",
    ...(offer.bonuses ? { bonuses: offer.bonuses } : {}),
  };
}

/** A club signs one of its offers: the brand is on its kit from today, the offer's years counting this season. */
export function signSponsorOffer(state: GameState, clubId: string, offerId: string): GameState {
  const offer = sponsorsOf(state, clubId).offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`${clubId} has no sponsor offer ${offerId}`);
  return putOnKit(state, clubId, offer);
}

/** Whether the coach of a human club leaves his sponsors to the board (the default). */
function boardNegotiates(state: GameState, clubId: string): boolean {
  const coach = clubId === state.coachClubId ? state.coach : waitingCoachesOf(state).find((w) => w.clubId === clubId)?.coach;
  return coach?.picksSponsors !== true;
}

/** On an offer's day, the board signs the best offer for each place if it pays more than the place does now; the rest lapse, as all do when the coach picks himself. */
function decideOffers(state: GameState, clubId: string, events: SponsorEvent[]): GameState {
  const due = sponsorsOf(state, clubId).offers.filter((o) => o.decideBy <= state.date);
  if (!due.length) return state;
  let next = state;
  if (boardNegotiates(state, clubId)) {
    const bests = due.filter((offer) => !due.some((other) => isSamePlace(other, offer) && other.yearly > offer.yearly));
    for (const slot of SPONSOR_SLOTS) {
      for (const best of bests.filter((o) => o.slot === slot)) {
        const sponsors = sponsorsOf(next, clubId);
        // A deal that pays as much stays: one in its last season renews at the turn for the same money.
        if (!sponsors.offers.includes(best) || best.yearly <= placeValueOf(sponsors, best)) continue;
        next = putOnKit(next, clubId, best);
        events.push({ type: "sponsorSigned", clubId, slot, brandName: best.brandName, yearly: best.yearly, years: best.years, byBoard: true });
      }
    }
  }
  const dueIds = new Set(due.map((o) => o.id));
  const sponsors = sponsorsOf(next, clubId);
  return withClubSponsors(next, clubId, { ...sponsors, offers: sponsors.offers.filter((o) => !dueIds.has(o.id)) });
}

/**
 * An ended deal at the season's turn: an AI club renews it (three times in five, a guess) or gives the
 * place to another brand of the pool that fits it, at the same value and keeping a betting house a betting
 * house, so the AI's money stays as it was; a human coach's club renews it, as his assistant would.
 */
function renewed(state: GameState, clubId: string, contract: SponsorContract, isHuman: boolean, taken: Set<string>): SponsorContract {
  const random = sponsorStream(state.seed, `renew:${clubId}:${contract.slot}:${state.season}`);
  const years = dealYears(contract.slot, random);
  const base = { ...contract, untilSeason: state.season - 1 + years, isEndKnown: true };
  delete base.bonuses;
  if (isHuman || random() < 0.6) return base;
  const size = clubSizeOf(state.finances[clubId]?.sponsorship ?? 0);
  const candidates = brandsForSlot(state.sponsorPool ?? [], contract.slot, size).filter((b) => isBettingBrand(b) === contract.isBetting && !taken.has(b.id));
  const brand = pickOne(candidates, random);
  if (!brand) return base;
  taken.add(brand.id);
  return { ...base, brandId: brand.id, brandName: brand.name, isBetting: isBettingBrand(brand), basis: "game" };
}

/** Title and continental bonuses of a human club's deals for the season just ended. */
function payBonuses(state: GameState, clubId: string, isChampion: boolean, isContinental: boolean, events: SponsorEvent[]): GameState {
  let next = state;
  for (const contract of sponsorsOf(state, clubId).contracts) {
    const paid = [
      ...(isChampion && contract.bonuses?.title ? [{ amount: contract.bonuses.title, reason: "title" as const }] : []),
      ...(isContinental && contract.bonuses?.continental ? [{ amount: contract.bonuses.continental, reason: "continental" as const }] : []),
    ];
    for (const { amount, reason } of paid) {
      next = withFinance(next, clubId, (f) => ({ ...f, cash: f.cash + amount, month: { ...f.month, revenue: { ...f.month.revenue, sponsorship: f.month.revenue.sponsorship + amount } } }));
      events.push({ type: "sponsorBonusPaid", clubId, brandName: contract.brandName, amount, reason });
    }
  }
  return next;
}

/** The clubs in next season's continental cups, by the game's own draws. */
function continentalClubs(state: GameState): Set<string> {
  return new Set(Object.values(state.competitions).flatMap((c) => (c.kind === "continental" && c.season === state.season && (c.cup === "libertadores" || c.cup === "sul-americana") ? c.entries.flat() : [])));
}

/** The season's turn: ended deals renewed or rotated, values following a change of division, bonuses paid, and offers after a big result. */
function turnSeason(before: GameState, after: GameState, outcomes: Readonly<Record<string, LeagueOutcome>>, events: SponsorEvent[]): GameState {
  const humans = new Set(humanClubIds(after));
  const champions = new Set(Object.values(outcomes).map((o) => o.championId));
  const continental = continentalClubs(after);
  // The season just ended earns its bonuses before its ended deals are renewed without them.
  let next = after;
  for (const clubId of humans) next = payBonuses(next, clubId, champions.has(clubId), continental.has(clubId), events);
  for (const [clubId, sponsors] of Object.entries(next.sponsors ?? {})) {
    const was = before.finances[clubId]?.sponsorship ?? 0;
    const now = after.finances[clubId]?.sponsorship ?? 0;
    // The deals follow the club's sponsorship when the turn moves it (a change of division, a rich club
    // drifting back): they are its breakdown, and a relegation clause cuts a real deal too.
    const scale = was > 0 && now !== was ? now / was : 1;
    const taken = new Set(sponsors.contracts.map((c) => c.brandId));
    const contracts = sponsors.contracts.map((contract) => {
      const kept = scale === 1 ? contract : { ...contract, yearly: roundDeal(contract.yearly * scale) };
      return kept.untilSeason < after.season ? renewed(next, clubId, kept, humans.has(clubId), taken) : kept;
    });
    next = withClubSponsors(next, clubId, { ...sponsors, contracts });
  }
  for (const clubId of humans) {
    if (!champions.has(clubId) && !continental.has(clubId)) continue;
    const random = sponsorStream(next.seed, `big:${clubId}:${next.season}`);
    const occupied = sponsorsOf(next, clubId).contracts.filter((c) => c.slot !== "kit");
    const deals = [...new Set(Array.from({ length: BIG_RESULT_OFFERS }, () => pickOne(occupied, random)).filter((deal) => deal !== undefined))];
    next = addOffers(next, clubId, drawOffers(next, clubId, deals.map((deal) => ({ slot: deal.slot, replaces: deal })), boardMeetingAfter(next.date), BIG_RESULT_PREMIUM), events);
  }
  return next;
}

/**
 * The sponsors' part of a day, from `before` (yesterday's game) to `after` (today's): offers for the
 * deals in their last season on 1 October, the board's decisions on the offers' day, and the season's turn.
 * Everything draws from the sponsors' own streams, so the rest of the game plays as it did without them.
 */
export function runSponsorDay(before: GameState, after: GameState, outcomes: Readonly<Record<string, LeagueOutcome>> = {}): { state: GameState; events: SponsorEvent[] } {
  if (!after.sponsors) return { state: after, events: [] };
  const events: SponsorEvent[] = [];
  let next = after.season > before.season ? turnSeason(before, after, outcomes, events) : after;
  const humans = new Set(humanClubIds(next));
  const wereHuman = new Set(humanClubIds(before));
  // A club the coaches left goes back to the AI, which takes no offers; a club a coach took gets offers for its empty places.
  for (const clubId of wereHuman) {
    const sponsors = next.sponsors?.[clubId];
    if (!humans.has(clubId) && sponsors?.offers.length) next = withClubSponsors(next, clubId, { ...sponsors, offers: [] });
  }
  for (const clubId of humans) {
    if (!wereHuman.has(clubId)) next = addOffers(next, clubId, drawOffers(next, clubId, emptyPlaces(sponsorsOf(next, clubId)), boardMeetingAfter(next.date)), events);
  }
  for (const clubId of humans) {
    if (next.date === `${next.season}-${RENEWAL_OFFERS_ON}`) {
      const sponsors = sponsorsOf(next, clubId);
      const ending = sponsors.contracts.filter((c) => c.untilSeason === next.season && !sponsors.offers.some((o) => isSamePlace(o, { slot: c.slot, replacesBrandId: c.brandId })));
      next = addOffers(next, clubId, drawOffers(next, clubId, ending.map((deal) => ({ slot: deal.slot, replaces: deal })), boardMeetingAfter(next.date)), events);
    }
    next = decideOffers(next, clubId, events);
  }
  return { state: next, events };
}
