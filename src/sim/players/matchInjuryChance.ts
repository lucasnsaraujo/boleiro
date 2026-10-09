import type { SimPlayer } from "../gameState.js";
import type { MatchContext } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";

// 27.5 time-loss injuries per 1000 match hours in 23 top European clubs, 2001–2008
// (Ekstrand, Hägglund & Waldén 2011, "Injury incidence and injury patterns in professional
// football: the UEFA injury study", BJSM 45(7):553–558).
const MATCH_INJURIES_PER_HOUR = 27.5 / 1000;
const MATCH_HOURS = 1.5;
// Previous injury roughly doubles to triples the risk of a new one (Hägglund, Waldén & Ekstrand
// 2006, BJSM 40(9):767–772). guess: injury-prone players get the low end, twice the risk.
const INJURY_PRONE_RISK = 2;
// Ankle sprains are 1.81 times as frequent in matches on third-generation artificial turf
// (4.83 v 2.66 per 1000 h) while other injuries do not differ (Ekstrand, Timpka & Hägglund 2006,
// BJSM 40(12):975–980). Ankle sprains are 2.66 / 21.48 = 12% of match injuries on grass in that
// study, so the overall rate rises by 0.81 × 12% ≈ 10%.
const ARTIFICIAL_PITCH_RISK = 1.1;
// League matches after ≤4 days' rest have 1.09 times the injury rate of those after ≥6 days
// (Bengtsson, Ekstrand & Hägglund 2013, BJSM 47(12):743–747). With the 1.5-day fatigue half-life
// (fatigueOn.ts) that is about 20 fatigue against 5 at kick-off, so each 100 fatigue adds
// 0.09 / 0.15 = 60% risk.
const FATIGUE_RISK_PER_MATCH = 0.6;

/** Chance that a player who starts this match picks up a time-loss injury in it. */
export function matchInjuryChance(player: SimPlayer, context: MatchContext): number {
  const prone = player.trait === "injuryProne" ? INJURY_PRONE_RISK : 1;
  const pitch = context.pitch === "artificial" ? ARTIFICIAL_PITCH_RISK : 1;
  const tired = 1 + (FATIGUE_RISK_PER_MATCH * fatigueOn(player, context.date)) / 100;
  return 1 - Math.exp(-MATCH_INJURIES_PER_HOUR * MATCH_HOURS * prone * pitch * tired);
}

// Mean absence of a first-time injury is 18 days (Ekstrand, Hägglund & Waldén 2011). guess: the
// share in each UEFA severity band (slight 1–3, minor 4–7, moderate 8–28, severe 29+ days),
// picked so the mean lands on 18 days (about 17.9).
const LAYOFF_BANDS: readonly { share: number; min: number; max: number }[] = [
  { share: 0.25, min: 1, max: 3 },
  { share: 0.25, min: 4, max: 7 },
  { share: 0.35, min: 8, max: 28 },
  { share: 0.15, min: 29, max: 100 },
];

/** Days out for a new injury. */
export function injuryLayoffDays(random: () => number): number {
  let roll = random();
  const band = LAYOFF_BANDS.find((b) => (roll -= b.share) < 0) ?? LAYOFF_BANDS.at(-1);
  if (!band) throw new Error("no injury layoff bands");
  return band.min + Math.floor(random() * (band.max - band.min + 1));
}
