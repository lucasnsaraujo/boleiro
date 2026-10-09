import { daysBetween } from "../dates.js";
import type { IsoDate } from "../gameState.js";
import type { PlayerProfile } from "./playerProfile.js";

// Most physical and muscle-damage markers are back to baseline about 72 h after a match
// (Nédélec et al. 2012, Sports Med 42(12):997–1015). guess: a half-life of 1.5 days leaves a
// quarter of a match's load after 3 days and 4% after a week, so two games a week pile up.
const FATIGUE_HALF_LIFE_DAYS = 1.5;

/** Fatigue on `date`, after the rest days since it was last measured. */
export function fatigueOn({ condition }: PlayerProfile, date: IsoDate): number {
  const rest = Math.max(0, daysBetween(condition.fatigueOn, date));
  return condition.fatigue * 0.5 ** (rest / FATIGUE_HALF_LIFE_DAYS);
}
