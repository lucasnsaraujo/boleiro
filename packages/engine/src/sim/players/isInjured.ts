import type { IsoDate } from "../gameState.js";
import type { PlayerProfile } from "./playerProfile.js";

export function isInjured({ condition }: PlayerProfile, date: IsoDate): boolean {
  return condition.injuredUntil !== null && date < condition.injuredUntil;
}
