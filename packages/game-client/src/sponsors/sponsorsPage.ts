import { SPONSOR_SLOTS, type SponsorSlot } from "@boleiro/data/sponsors";
import type { Fixture, GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { bookmakerOdds, type MatchPrices } from "@boleiro/engine/sim/sponsors/bookmakerOdds";
import type { DealBasis, DealBonuses, PastDeal, SponsorContract, SponsorOffer } from "@boleiro/engine/sim/sponsors/sponsors";
import { matchClubOf } from "@boleiro/engine/sim/players/matchSetup";

/** Each place on the kit as the sponsors screen and the paper name it. */
export const SLOT_NAMES: Record<SponsorSlot, string> = {
  master: "Master",
  kit: "Fornecedor",
  front: "Frente",
  back: "Costas",
  sleeves: "Mangas",
  shorts: "Calção",
  socks: "Meião",
  number: "Número",
};

/** A deal on the kit as the screen lists it; `untilSeason` null when the press never reported its end. */
export type SponsorRow = { slot: SponsorSlot; brandId: string; brandName: string; isBetting: boolean; yearly: number; untilSeason: number | null; basis: DealBasis; bonuses?: DealBonuses };

/** An offer as the screen lists it, with the brand it would replace. */
export type OfferRow = SponsorOffer & { replaces: string | null };

/** The coach's next match and a bookmaker's odds for it. */
export type MatchOddsSticker = { fixtureId: string; date: IsoDate; homeId: string; awayId: string; homeName: string; awayName: string; odds: MatchPrices };
/** The odds a betting sponsor posts before the coach's next match. */
export type BetSticker = MatchOddsSticker & { brandId: string; brandName: string };

export type SponsorsPage = {
  clubId: string;
  season: number;
  contracts: SponsorRow[];
  /** What the deals on the kit pay a year, and the club's whole yearly sponsorship, which they are part of. */
  total: number;
  sponsorship: number;
  offers: OfferRow[];
  /** Deals that left the kit, newest first. */
  past: PastDeal[];
  /** True when the board signs the best offer on its day; false when the coach picks his sponsors himself. */
  isBoardNegotiating: boolean;
  /** The betting house on the kit, the master first, and its odds for the next match. */
  bet: BetSticker | null;
  /** The next match's odds as any betting house would post them, for the offers of one. */
  nextMatch: MatchOddsSticker | null;
  /** The best yearly offer outside betting for the master, when the master is a betting house and such an offer is on the table. */
  bestOtherMaster: number | null;
};

const bySlot = (a: { slot: SponsorSlot }, b: { slot: SponsorSlot }) => SPONSOR_SLOTS.indexOf(a.slot) - SPONSOR_SLOTS.indexOf(b.slot);

function rowOf(contract: SponsorContract): SponsorRow {
  const { slot, brandId, brandName, isBetting, yearly, untilSeason, isEndKnown, basis, bonuses } = contract;
  return { slot, brandId, brandName, isBetting, yearly, untilSeason: isEndKnown ? untilSeason : null, basis, ...(bonuses ? { bonuses } : {}) };
}

/** The coach's next unplayed fixture from today on. */
function nextFixtureOf(state: Pick<GameState, "date" | "coachClubId" | "fixtures">): Fixture | null {
  const clubId = state.coachClubId;
  if (!clubId) return null;
  let next: Fixture | null = null;
  for (const f of state.fixtures) {
    if (f.result || f.date < state.date || (f.homeId !== clubId && f.awayId !== clubId)) continue;
    if (!next || f.date < next.date) next = f;
  }
  return next;
}

/** The coach's next match with a bookmaker's odds; null without a club or a match ahead. */
function nextMatchOdds(state: GameState): MatchOddsSticker | null {
  const fixture = nextFixtureOf(state);
  if (!fixture) return null;
  const name = (id: string) => matchClubOf(state, id)?.shortName ?? id;
  const { id: fixtureId, date, homeId, awayId } = fixture;
  return { fixtureId, date, homeId, awayId, homeName: name(homeId), awayName: name(awayId), odds: bookmakerOdds(state, fixture) };
}

/** The betting house on the coach's kit (the master first) and its odds for his next match; null without one or without a match. */
export function betStickerOf(state: GameState): BetSticker | null {
  const clubId = state.coachClubId;
  const contracts = clubId ? (state.sponsors?.[clubId]?.contracts ?? []) : [];
  const bet = contracts.find((c) => c.isBetting && c.slot === "master") ?? contracts.find((c) => c.isBetting);
  const match = bet ? nextMatchOdds(state) : null;
  return bet && match ? { ...match, brandId: bet.brandId, brandName: bet.brandName } : null;
}

/** The sponsors screen of the seated coach's club; null without a club or sponsors. */
export function sponsorsPageOf(state: GameState): SponsorsPage | null {
  const clubId = state.coachClubId;
  const sponsors = clubId ? state.sponsors?.[clubId] : undefined;
  if (!clubId || !sponsors) return null;
  const contracts = sponsors.contracts.map(rowOf).sort(bySlot);
  const master = sponsors.contracts.find((c) => c.slot === "master");
  const otherMasters = sponsors.offers.filter((o) => o.slot === "master" && !o.isBetting).map((o) => o.yearly);
  return {
    clubId,
    season: state.season,
    contracts,
    total: contracts.reduce((sum, c) => sum + c.yearly, 0),
    sponsorship: state.finances[clubId]?.sponsorship ?? 0,
    offers: [...sponsors.offers].sort((a, b) => bySlot(a, b) || b.yearly - a.yearly).map((offer) => ({ ...offer, replaces: sponsors.contracts.find((c) => c.slot === offer.slot)?.brandName ?? null })),
    past: [...sponsors.past].reverse(),
    isBoardNegotiating: state.coach.picksSponsors !== true,
    bet: betStickerOf(state),
    nextMatch: sponsors.offers.some((o) => o.isBetting) ? nextMatchOdds(state) : null,
    bestOtherMaster: master?.isBetting && otherMasters.length ? Math.max(...otherMasters) : null,
  };
}
