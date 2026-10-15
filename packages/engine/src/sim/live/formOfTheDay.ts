import { keyedStream } from "../../engine/random.js";

/** What pulls a player's form going into a match: his morale (0 to 100) and his fatigue (100 is one full match's load). */
export type FormPull = { morale: number; fatigue: number };

// guess: no public data measures day-to-day form. A player's form is a normal draw kept between
// −1 (an awful day) and 1 (an inspired one); about one player in seven has a clearly bad day
// (below −0.5) and as many a clearly good one.
const FORM_SD = 0.45;
// guess: full morale lifts the mean form by a quarter, none sinks it as much; a full match's load
// beyond what a player usually carries into a match sinks it by 0.3. Starters carry about 5 on
// average over a season (a week's rest leaves 4, fatigueOn), which keeps a season's mean form at 0.
const MORALE_PULL = 0.25;
const FATIGUE_PULL = 0.3;
const USUAL_FATIGUE = 5;
// guess: strength points a player gains on an inspired day and loses on an awful one; about twice
// the morale effect (moraleStrength) and half the cost of a full match of fatigue (effectiveStrength), so a whole
// side's form moves results only slightly.
const FORM_STRENGTH = 2;
const FORM_STREAM_SALT = 0xf0a3;

/** A player's form of the day in a match, from −1 to 1: drawn from the save's seed and the fixture, pulled by morale and fatigue. */
export function formOfTheDay(seed: number, fixtureId: string, playerId: string, pull: FormPull): number {
  const random = keyedStream(seed ^ FORM_STREAM_SALT, `${fixtureId}/${playerId}`);
  const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const mean = (MORALE_PULL * (pull.morale - 50)) / 50 - (FATIGUE_PULL * (pull.fatigue - USUAL_FATIGUE)) / 100;
  return Math.max(-1, Math.min(1, mean + FORM_SD * normal));
}

/** The strength points a player's form adds to or takes from his strength today. */
export function formStrength(form: number): number {
  return FORM_STRENGTH * form;
}
