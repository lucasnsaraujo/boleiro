import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Division } from "@boleiro/data/players";

/** The statuses the market can be filtered by. */
export type MarketStatus = "freeAgent" | "contractEnding" | "lendable" | "lentOut";
export type MarketFilters = {
  name: string;
  group: PositionGroup | null;
  minStrength: number | null;
  maxStrength: number | null;
  clubId: string | null;
  division: Division | null;
  status: MarketStatus | null;
  /** Only players who would say yes or maybe to joining the coach's club. */
  isWillingOnly: boolean;
  /** A nationality as the data names it ("Argentina"); a player with two matches either. */
  nationality: string | null;
  /** This season's goals, every competition together, at least. */
  minGoals: number | null;
  /** This season's minutes on the pitch, at least. */
  minMinutes: number | null;
  /** Only players on the coach's watch list. */
  isWatchedOnly: boolean;
};

export const NO_FILTERS: MarketFilters = {
  name: "",
  group: null,
  minStrength: null,
  maxStrength: null,
  clubId: null,
  division: null,
  status: null,
  isWillingOnly: false,
  nationality: null,
  minGoals: null,
  minMinutes: null,
  isWatchedOnly: false,
};
