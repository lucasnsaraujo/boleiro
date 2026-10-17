import { BRAND_SIZES, isBettingBrand, SPONSOR_SLOTS, type Brand, type BrandSize, type ShirtDeal, type SponsorSlot } from "@boleiro/data/sponsors";
import { keyedStream } from "../../engine/random.js";
import type { GameState, IsoDate } from "../gameState.js";

/**
 * Where a deal's value comes from: the press (`press`), the game's estimate for a real deal whose value
 * was never published (`estimate`), or a deal the game made (`game`): an offer signed in a career, or the
 * sponsor it gives a club the data has none for.
 */
export type DealBasis = "press" | "estimate" | "game";

/**
 * Title and continental qualification bonuses a deal signed in the game pays at the season's end, in BRL:
 * its own terms, which it pays instead of the tenth sponsors usually pay for a title or a promotion
 * (renewFinances.ts). A deal without terms of its own pays that tenth.
 */
export type DealBonuses = { title?: number; continental?: number };

/** A brand on the club's kit: `yearly` BRL until the end of `untilSeason`; `isEndKnown` false when that end is the game's guess. */
export type SponsorContract = {
  slot: SponsorSlot;
  brandId: string;
  brandName: string;
  isBetting: boolean;
  yearly: number;
  untilSeason: number;
  isEndKnown: boolean;
  basis: DealBasis;
  bonuses?: DealBonuses;
};

/** A brand that wants a place on the coach's kit for `years` seasons from today; the board decides on `decideBy`. */
export type SponsorOffer = {
  id: string;
  slot: SponsorSlot;
  brandId: string;
  brandName: string;
  isBetting: boolean;
  yearly: number;
  years: number;
  bonuses?: DealBonuses;
  decideBy: IsoDate;
  /** The brand on the kit whose deal it would replace; left out for an empty place. */
  replacesBrandId?: string;
  /**
   * What the place pays the club today: the deal it would replace, or an empty place's part of the
   * sponsorship no deal holds. Signing moves the club's sponsorship by `yearly` less this.
   */
  placeValue: number;
};

/** A deal that left the kit: replaced by another brand, or ended. */
export type PastDeal = { slot: SponsorSlot; brandId: string; brandName: string; yearly: number; endedOn: IsoDate; reason: "replaced" | "ended" };

/**
 * A club's deals; only a human coach's club gets offers and keeps its past deals. `bettingSince` is the day
 * a betting house signed in the game went on a kit that had none, which cost the fans; left out otherwise.
 */
export type ClubSponsors = { contracts: SponsorContract[]; offers: SponsorOffer[]; past: PastDeal[]; bettingSince?: IsoDate };

/** A brand of the offer pool, kept with the game. */
export type PoolBrand = Pick<Brand, "id" | "name" | "sector"> & { size: BrandSize };

/** The data the sponsors are seeded from: `packages/data/pack/sponsors.pack.json.gz`. */
export type SponsorFiles = { brands: readonly Brand[]; deals: readonly ShirtDeal[] };

const SPONSORS_STREAM_SALT = 0x5b0a50;

/**
 * Each place's share of a club's yearly sponsorship, from Flamengo's 2026 kit: Betano R$ 268.5 mi, adidas
 * R$ 70 mi, BRB and Ademicon R$ 56.6 mi on the front, Hapvida R$ 23.8 mi on the back, Shopee R$ 12 mi on
 * the sleeves and five smaller deals R$ 36.7 mi (InfoMoney, https://www.infomoney.com.br/esportes/flamengo-pode-bater-r-4676-milhoes-em-valor-de-uniforme-gracas-a-patrocinios/),
 * against R$ 541 mi of commercial revenue in its 2025 accounts (EY, data/finances.csv). The smaller
 * deals' split between shorts, socks and number is a guess.
 */
export const SLOT_SHARE: Record<SponsorSlot, number> = {
  master: 0.496,
  kit: 0.129,
  front: 0.105,
  back: 0.044,
  sleeves: 0.022,
  shorts: 0.03,
  socks: 0.018,
  number: 0.02,
};

/** The share of a club's sponsorship Flamengo's places leave off the kit: licensing and the sponsors off the shirt. */
export const OFF_KIT_SHARE = 1 - SPONSOR_SLOTS.reduce((sum, slot) => sum + SLOT_SHARE[slot], 0);
// guess: the deals on a kit leave at least a twentieth of a club's sponsorship to licensing and the
// sponsors off the shirt (Flamengo's leave 14%).
const SHIRT_SHARE_CAP = 0.95;
// guess: deals whose end the press never reported run one to three seasons, a kit maker's two to four.
const SPONSOR_YEARS = [1, 3] as const;
const KIT_YEARS = [2, 4] as const;
/** The yearly sponsorship at which a club is big enough for each size of brand, biggest first (guess). */
const CLUB_SIZE_FLOOR: Record<BrandSize, number> = { giant: 150_000_000, large: 30_000_000, medium: 5_000_000, small: 0 };
/** Values are kept in steps of R$ 100 thousand, or R$ 10 thousand under a million, the smallest a deal pays. */
const STEP = 100_000;
const SMALL_STEP = 10_000;

export const roundDeal = (value: number): number => {
  const step = value < 1_000_000 ? SMALL_STEP : STEP;
  return Math.max(SMALL_STEP, Math.round(value / step) * step);
};

/** The size of brand that fits a club with this much yearly sponsorship. */
export function clubSizeOf(sponsorship: number): BrandSize {
  return BRAND_SIZES.find((size) => sponsorship >= CLUB_SIZE_FLOOR[size]) ?? "small";
}

/** Whether a brand of `size` deals with a club of `clubSize`: its own size or one step either side. */
function isWithinReach(size: BrandSize, clubSize: BrandSize): boolean {
  return Math.abs(BRAND_SIZES.indexOf(size) - BRAND_SIZES.indexOf(clubSize)) <= 1;
}

/** The pool's brands that can take a place on a club's kit: kit makers for the kit, anyone else elsewhere. */
export function brandsForSlot(pool: readonly PoolBrand[], slot: SponsorSlot, clubSize: BrandSize): PoolBrand[] {
  return pool.filter((b) => (slot === "kit") === (b.sector === "kit") && isWithinReach(b.size, clubSize));
}

export function sponsorStream(seed: number, key: string): () => number {
  return keyedStream(seed ^ SPONSORS_STREAM_SALT, key);
}

export function pickOne<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

const between = ([low, high]: readonly [number, number], random: () => number) => low + Math.floor(random() * (high - low + 1));

/** A deal's years when the press reported none: a guess drawn on the club's own stream. */
export function dealYears(slot: SponsorSlot, random: () => number): number {
  return between(slot === "kit" ? KIT_YEARS : SPONSOR_YEARS, random);
}

function poolOf(brands: readonly Brand[]): PoolBrand[] {
  return brands.flatMap((b) => (b.isPool && b.size ? [{ id: b.id, name: b.name, sector: b.sector, size: b.size }] : []));
}

/**
 * A club's real deals: the press's values where they fit in its sponsorship, the rest estimated from
 * each place's share of it and split between the brands that share a place.
 */
function realContracts(deals: readonly ShirtDeal[], brands: ReadonlyMap<string, Brand>, sponsorship: number, season: number, random: () => number): SponsorContract[] {
  const cap = SHIRT_SHARE_CAP * sponsorship;
  const reported = deals.reduce((sum, d) => sum + (d.yearly ?? 0), 0);
  const pressFits = reported <= cap;
  const sharing = (slot: SponsorSlot) => deals.filter((d) => d.slot === slot).length;
  const shareOf = (d: ShirtDeal) => (SLOT_SHARE[d.slot] * sponsorship) / sharing(d.slot);
  const estimated = deals.filter((d) => d.yearly === null || !pressFits);
  const estimatedTotal = estimated.reduce((sum, d) => sum + shareOf(d), 0);
  const room = pressFits ? cap - reported : cap;
  const scale = estimatedTotal > 0 ? Math.min(1, room / estimatedTotal) : 1;
  return deals.map((d) => {
    const brand = brands.get(d.brandId);
    const isPress = d.yearly !== null && pressFits;
    const untilSeason = d.untilSeason ?? season - 1 + dealYears(d.slot, random);
    return {
      slot: d.slot,
      brandId: d.brandId,
      brandName: brand?.name ?? d.brandId,
      isBetting: brand ? isBettingBrand(brand) : false,
      yearly: isPress && d.yearly !== null ? d.yearly : roundDeal(shareOf(d) * scale),
      untilSeason,
      isEndKnown: d.untilSeason !== null,
      basis: isPress ? "press" : "estimate",
    };
  });
}

/** A master and a kit maker from the pool, sized to the club, for a club the data has no sponsors for. */
function gameContracts(pool: readonly PoolBrand[], sponsorship: number, season: number, random: () => number): SponsorContract[] {
  const size = clubSizeOf(sponsorship);
  return (["master", "kit"] as const).flatMap((slot): SponsorContract[] => {
    const brand = pickOne(brandsForSlot(pool, slot, size), random);
    if (!brand) return [];
    return [{
      slot,
      brandId: brand.id,
      brandName: brand.name,
      isBetting: isBettingBrand(brand),
      yearly: roundDeal(SLOT_SHARE[slot] * sponsorship),
      untilSeason: season - 1 + dealYears(slot, random),
      isEndKnown: false,
      basis: "game",
    }];
  });
}

const bySlot = (a: SponsorContract, b: SponsorContract) => SPONSOR_SLOTS.indexOf(a.slot) - SPONSOR_SLOTS.indexOf(b.slot);

/**
 * Every club's kit deals at the start of a game, from the data's pre-ban tables: deterministic from the
 * game's seed and the club, so an old save seeded later gets the same deals. They are a breakdown of the
 * club's yearly sponsorship and leave it as it is.
 */
export function seedSponsors(state: Pick<GameState, "seed" | "season" | "finances">, files: SponsorFiles): { sponsors: Record<string, ClubSponsors>; pool: PoolBrand[] } {
  const pool = poolOf(files.brands);
  const brands = new Map(files.brands.map((b) => [b.id, b]));
  const dealsOf = new Map<string, ShirtDeal[]>();
  for (const d of files.deals) dealsOf.set(d.clubId, [...(dealsOf.get(d.clubId) ?? []), d]);
  const sponsors = Object.fromEntries(
    Object.entries(state.finances).map(([clubId, finance]): [string, ClubSponsors] => {
      const random = sponsorStream(state.seed, `seed:${clubId}`);
      const deals = dealsOf.get(clubId);
      const contracts = deals ? realContracts(deals, brands, finance.sponsorship, state.season, random) : gameContracts(pool, finance.sponsorship, state.season, random);
      return [clubId, { contracts: contracts.sort(bySlot), offers: [], past: [] }];
    }),
  );
  return { sponsors, pool };
}
