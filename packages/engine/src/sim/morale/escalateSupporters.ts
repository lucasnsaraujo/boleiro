import type { ClubMood } from "./clubMood.js";

export type FansPressure = { type: "fansPressure"; clubId: string; fans: number };
export type FansProtest = { type: "fansProtest"; clubId: string; fans: number; moraleLost: number };
/** Fans caused disorder at a game; the sports court fined the club `fine` BRL (0 when it closed the doors instead). */
export type FansViolence = { type: "fansViolence"; clubId: string; fine: number };
export type ClosedDoors = { type: "closedDoors"; clubId: string; games: number };
export type SupporterEvent = FansPressure | FansProtest | FansViolence | ClosedDoors;

type Escalation = { mood: ClubMood; events: SupporterEvent[]; fine: number };

// guess: fan mood (0–100, 50 neutral) at which the organised supporters start each step, and
// where they stand down. With the swings in reactToDay a club is under pressure after about
// four defeats in a row and protests after five or six.
const PRESSURE_BELOW = 35;
const PROTEST_BELOW = 25;
const VIOLENCE_BELOW = 20;
const CALM_FROM = 45;
// guess: squad morale lost to a protest at the training ground.
const PROTEST_MORALE_COST = 8;
// guess: chance that a defeat while protests go on ends in disorder the sports court punishes.
const VIOLENCE_CHANCE = 0.12;
// guess: chance that a derby defeat ends in crowd trouble the court punishes, whatever the fans' mood
// (flares, thrown objects, a fight in the stands). The press reported a handful of such derby cases a
// season in 2025 and 2026 (Ba-Vi, Atletiba, Corinthians against São Paulo, Santos against Corinthians and
// Palmeiras) out of the dozens of derbies played, so about one derby defeat in twenty-five.
export const DERBY_TROUBLE_CHANCE = 0.04;
// The STJD judges disorder, invasion or thrown objects under art. 213 of the CBJD (Código Brasileiro de
// Justiça Desportiva): a fine of up to R$ 100,000 or, for serious cases, home games lost. Reported first
// cases are fined R$ 10,000 to R$ 100,000 or lose one to three home games (Grêmio 3, Cruzeiro 3, Goiás 3,
// Athletico 1). Repeat offenders also answer under other articles (211, 243-G) and get more: Atlético-MG
// paid R$ 198,000 and lost six home games for the 2024 Copa do Brasil final, Sport lost eight.
const FIRST_CASE = { fine: { min: 10_000, max: 100_000 }, closedGames: { min: 1, max: 3 } };
const REPEAT_CASE = { fine: { min: 10_000, max: 198_000 }, closedGames: { min: 3, max: 8 } };
// guess: a third of punished incidents are serious enough to cost home games instead of a fine.
const CLOSED_DOORS_SHARE = 1 / 3;

/** The court's verdict on disorder: home games behind closed doors or a fine, harder for a club already punished. */
function punish(clubId: string, mood: ClubMood, random: () => number): Escalation {
  const ladder = mood.supporters === "violence" ? REPEAT_CASE : FIRST_CASE;
  if (random() < CLOSED_DOORS_SHARE) {
    const { min, max } = ladder.closedGames;
    const games = min + Math.floor(random() * (max - min + 1));
    return {
      mood: { ...mood, supporters: "violence", closedDoorGames: mood.closedDoorGames + games },
      events: [{ type: "fansViolence", clubId, fine: 0 }, { type: "closedDoors", clubId, games }],
      fine: 0,
    };
  }
  const { min, max } = ladder.fine;
  const fine = Math.round(min + random() * (max - min));
  return { mood: { ...mood, supporters: "violence" }, events: [{ type: "fansViolence", clubId, fine }], fine };
}

/** One step up or down the supporters' ladder, with disorder after a defeat while protests go on. */
function escalateMood(clubId: string, mood: ClubMood, lostToday: boolean, random: () => number): Escalation {
  const { fans, supporters } = mood;
  if (fans >= CALM_FROM) return { mood: { ...mood, supporters: "calm" }, events: [], fine: 0 };
  if (supporters === "calm" && fans < PRESSURE_BELOW) {
    return { mood: { ...mood, supporters: "pressure" }, events: [{ type: "fansPressure", clubId, fans }], fine: 0 };
  }
  if (supporters === "pressure" && fans < PROTEST_BELOW) {
    const squad = Math.max(0, mood.squad - PROTEST_MORALE_COST);
    return {
      mood: { ...mood, supporters: "protest", squad },
      events: [{ type: "fansProtest", clubId, fans, moraleLost: mood.squad - squad }],
      fine: 0,
    };
  }
  const isProtesting = supporters === "protest" || supporters === "violence";
  if (!isProtesting || !lostToday || fans >= VIOLENCE_BELOW || random() >= VIOLENCE_CHANCE) return { mood, events: [], fine: 0 };
  return punish(clubId, mood, random);
}

/**
 * Moves a club's organised supporters at most one step after a day that changed its mood. Disorder
 * only follows a defeat: while protests go on, or after a derby lost when `derbyTrouble` is given (the
 * stream the court's verdict on that trouble draws from). Returns the fine the club owes, if any.
 */
export function escalateSupporters(
  clubId: string,
  mood: ClubMood,
  lostToday: boolean,
  random: () => number,
  derbyTrouble: (() => number) | null = null,
): Escalation {
  const escalated = escalateMood(clubId, mood, lostToday, random);
  if (!derbyTrouble || escalated.events.some((e) => e.type === "fansViolence")) return escalated;
  const punished = punish(clubId, escalated.mood, derbyTrouble);
  return { mood: punished.mood, events: [...escalated.events, ...punished.events], fine: punished.fine };
}
