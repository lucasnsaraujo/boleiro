import { addDays } from "../dates.js";
import type { IsoDate, SimPlayer } from "../gameState.js";
import type { MatchContext } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";

// 27.5 time-loss injuries per 1000 match hours in 23 top European clubs, 2001–2008
// (Ekstrand, Hägglund & Waldén 2011, "Injury incidence and injury patterns in professional
// football: the UEFA injury study", BJSM 45(7):553–558).
export const MATCH_INJURIES_PER_HOUR = 27.5 / 1000;
export const MATCH_HOURS = 1.5;
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

// Older players get hurt more: 1.05 times the rate per year of age among amateur men (Sonesson,
// Lindblom & Hägglund 2023, KSSTA, doi:10.1007/s00167-023-07517-6), while elite cohorts find it only for calf strains
// (Hägglund, Waldén & Ekstrand 2013, AJSM 41(2):327–335). guess: 1.03 a year, between the two,
// divided by its mean over the 2026 squads' ages (1.0135) so the squads' average rate stays the study's.
const AGE_RISK_PER_YEAR = 1.03;
const AGE_RISK_MEAN = 1.0135;
const MEDIAN_AGE = 26;
// Within two months of returning a player is in his "early recurrence" window (Fuller et al. 2006,
// consensus on injury definitions, BJSM 40(3):193–201). A previous injury multiplies the next season's
// risk by 2.7 (Hägglund, Waldén & Ekstrand 2006). guess: twice the risk in the window, and the injury
// that comes is the same one again.
const RECURRENCE_DAYS = 60;
const RECURRENCE_RISK = 2;

export type InjuryKind = "muscle" | "ligament" | "knock";
/** An injury drawn for a match: what it is, the days out, and whether it is the last one coming back. */
export type Injury = { kind: InjuryKind; days: number; isRecurrence: boolean };
/** UEFA's bands for days out (Fuller et al. 2006): slight 1–3, minor 4–7, moderate 8–28, severe 29 and more. */
export type InjurySeverity = "slight" | "minor" | "moderate" | "severe";

/** Whether a player came back from an injury less than two months before `date`. */
function isRecurrenceWindow(player: SimPlayer, date: IsoDate): boolean {
  const back = player.condition.injuredUntil;
  return back !== null && back <= date && date < addDays(back, RECURRENCE_DAYS);
}

/** Chance that a player who starts this match picks up a time-loss injury in it. */
export function matchInjuryChance(player: SimPlayer, context: MatchContext): number {
  const prone = player.trait === "injuryProne" ? INJURY_PRONE_RISK : 1;
  const pitch = context.pitch === "artificial" ? ARTIFICIAL_PITCH_RISK : 1;
  const tired = 1 + (FATIGUE_RISK_PER_MATCH * fatigueOn(player, context.date)) / 100;
  const age = AGE_RISK_PER_YEAR ** (player.age - MEDIAN_AGE) / AGE_RISK_MEAN;
  const recurrence = isRecurrenceWindow(player, context.date) ? RECURRENCE_RISK : 1;
  return 1 - Math.exp(-MATCH_INJURIES_PER_HOUR * MATCH_HOURS * prone * pitch * tired * age * recurrence);
}

// Match injuries in the UEFA Elite Club Injury Study, 2000/01–2018/19 (Ekstrand et al. 2021, BJSM
// 55(19):1084–1092, table 2): muscle injuries 40.3%, ligament injuries 16.7%, the other 43% contusions,
// joints and fractures. Days out of each kind are log-normal, fitted to its shares in UEFA's severity
// bands at Copa Libertadores clubs in 2016 (Bengtsson, Ortega Gallo & Ekstrand 2021, BMJ Open Sport
// Exerc Med 7(4):e001172, table 5): muscle 20/21/53/6%, ligament 11/20/45/24%, the rest 28/25/26/21%.
// The fitted medians (9.1, 13.1 and 7.8 days) are scaled by 0.88 so first injuries average 18 days
// (Ekstrand, Hägglund & Waldén 2011); the mix then has 24/23/39/14% against the table's 21/22/42/15%.
const KINDS: readonly { kind: InjuryKind; share: number; median: number; sigma: number }[] = [
  { kind: "muscle", share: 0.403, median: 8, sigma: 0.9 },
  { kind: "ligament", share: 0.167, median: 11.5, sigma: 1.1 },
  { kind: "knock", share: 0.43, median: 6.9, sigma: 1.54 },
];
// Re-injuries keep players out 24 days against 18 for first injuries (Ekstrand, Hägglund & Waldén 2011).
const RECURRENCE_LAYOFF = 24 / 18;
// guess: 2% longer to recover for each year over 26, 2% shorter under it; no study found puts a number on it.
const LAYOFF_PER_YEAR = 0.02;
// guess: nobody is out longer than ten months; a torn cruciate takes six to seven.
const LONGEST_LAYOFF = 300;

/** A day count drawn from a log-normal with this median and log spread, at least one day. */
function logNormalDays(median: number, sigma: number, random: () => number): number {
  const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  return Math.min(LONGEST_LAYOFF, Math.max(1, Math.round(median * Math.exp(sigma * z))));
}

/** What an injury picked up on `date` is and how long it keeps the player out: his last one again inside its recurrence window. */
export function drawInjury(player: SimPlayer, date: IsoDate, random: () => number): Injury {
  const last = player.condition.injury;
  const isRecurrence = last !== undefined && isRecurrenceWindow(player, date);
  let roll = random();
  const type = (isRecurrence && KINDS.find((k) => k.kind === last)) || (KINDS.find((k) => (roll -= k.share) < 0) ?? KINDS.at(-1));
  if (!type) throw new Error("no injury kinds");
  const age = Math.max(0.5, 1 + LAYOFF_PER_YEAR * (player.age - MEDIAN_AGE));
  const scale = age * (isRecurrence ? RECURRENCE_LAYOFF : 1);
  return { kind: type.kind, days: logNormalDays(type.median * scale, type.sigma, random), isRecurrence };
}

export function injurySeverity(days: number): InjurySeverity {
  return days <= 3 ? "slight" : days <= 7 ? "minor" : days <= 28 ? "moderate" : "severe";
}
