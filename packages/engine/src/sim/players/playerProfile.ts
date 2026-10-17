import type { IsoDate } from "../gameState.js";
import type { InjuryKind } from "./matchInjuryChance.js";

export type Trait = "injuryProne" | "poorOnArtificialTurf" | "aggressive";

/** What changes from match to match. Fatigue is on a 0–100+ scale where one full match adds 100. */
export type Condition = {
  fatigue: number;
  /** The day `fatigue` was measured; it decays from there (fatigueOn). */
  fatigueOn: IsoDate;
  /** Fit again from this day on. */
  injuredUntil: IsoDate | null;
  /** What his latest injury was; a save from before injury kinds, or a player never hurt, has none. */
  injury?: InjuryKind;
  /** Set when a foreign player joins a club; null once he has always been there. */
  arrivedOn: IsoDate | null;
  seasonMinutes: number;
  /** League points his team took in the games he played this season. */
  seasonPoints: number;
};

export type PlayerProfile = {
  age: number;
  nationalities: string[];
  trait: Trait | null;
  condition: Condition;
};
