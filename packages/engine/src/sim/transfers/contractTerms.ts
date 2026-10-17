import type { IsoDate, SimPlayer } from "../gameState.js";

// Lei 14.597/2023 (Lei Geral do Esporte) art. 86: a professional athlete's contract runs at least three months
// and at most five years (https://www.legjur.com/legislacao/art/lei_00145972023-86). The game offers six
// months, then whole seasons up to the cap.
export const CONTRACT_MONTHS = [6, 12, 24, 36, 48, 60] as const;
export type ContractMonths = (typeof CONTRACT_MONTHS)[number];

/**
 * How a player takes a contract length: the one he wants, one he agrees to, one he signs only for the
 * full ask and maybe not even then, or one he won't talk about.
 */
export type Stance = "wants" | "agrees" | "hard" | "refuses";
const STANCES: readonly Stance[] = ["wants", "agrees", "hard", "refuses"];

/** The monthly wage in BRL a player asks for a contract of `months`, and how he takes that length. */
export type ContractTerm = { months: ContractMonths; wage: number; stance: Stance };

/** What weighs on a player's talks besides his age: his squad's morale (0–100), whether he asked to leave, and the club with an offer for him ("abroad" for Europe). */
export type TalkMood = { morale: number; hasAskedToLeave: boolean; offerFrom: string | null };
export const NEUTRAL_TALKS: TalkMood = { morale: 50, hasAskedToLeave: false, offerFrom: null };

// No public data measures how players weigh contract lengths, so the model below is a guess, tuned to read
// like the approved renewal mock (a 29-year-old centre-forward wants three years, takes two for a little more,
// asks 30% more for six months and refuses it).
// guess: a player wants two years up to 21 and three months more for every year older, up to three years at 25.
const YOUNG_WISH = 24;
const WISH_AGE = 21;
const WISH_MONTHS_PER_YEAR = 3;
const LONGEST_WISH = 36;
// guess: a young star (24 or under, among his squad's three strongest) wants a year, to move up soon.
const STAR_WISH = 12;
const STAR_AGE = 24;
const STAR_RANK = 3;
// guess: every year a length is off his wish costs 5% of the wage, squared: 5% one year off, 20% two years off.
const PREMIUM_PER_YEAR_SQUARED = 0.05;
// guess: within three months of his wish he wants it, within a year he agrees, within two it's hard; beyond, he refuses.
const STANCE_STEPS: readonly { yearsOff: number }[] = [{ yearsOff: 0.25 }, { yearsOff: 1 }, { yearsOff: 2 }];
// guess: asking to leave in the last year makes him a step harder and 15% dearer; a club's offer waiting, a step and 10%.
const LEAVE_PREMIUM = 0.15;
const OFFER_PREMIUM = 0.1;
// guess: squad morale moves every ask up to 10% either way around a neutral 50; below 30 he is a step harder too.
const MORALE_PREMIUM_PER_POINT = 0.002;
const SOUR_MORALE = 30;
// guess: a club's usual deal is two years; the assistant and AI clubs offer the agreed length nearest it.
const USUAL_MONTHS = 24;

/**
 * The last day of a deal of `months` from `from`: the 30 June or 31 December nearest to it, always after
 * `from`. A renewal counts from the end of the contract it extends.
 */
export function contractEndAfter(from: IsoDate, months: number): IsoDate {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7)) - 1;
  const day = Number(from.slice(8, 10));
  // Months since year 0 to the target day; a half-season boundary b is the start of month b, just after its last day.
  const target = year * 12 + month + months + (day - 1) / 31;
  const start = year * 12 + month + day / 31;
  let boundary = Math.round(target / 6) * 6;
  if (boundary <= start) boundary = Math.floor(start / 6) * 6 + 6;
  const endsIn = boundary - 1;
  const endYear = Math.floor(endsIn / 12);
  return endsIn % 12 === 5 ? `${endYear}-06-30` : `${endYear}-12-31`;
}

type Talker = Pick<SimPlayer, "id" | "age" | "strength">;

/** The contract length in months a player wants, from his age and his place in his squad. */
export function preferredMonths(player: Talker, squad: readonly Pick<SimPlayer, "id" | "strength">[]): number {
  const stronger = squad.filter((p) => p.id !== player.id && p.strength > player.strength).length;
  if (player.age <= STAR_AGE && stronger < STAR_RANK) return STAR_WISH;
  return Math.min(LONGEST_WISH, Math.max(YOUNG_WISH, YOUNG_WISH + (player.age - WISH_AGE) * WISH_MONTHS_PER_YEAR));
}

function stanceOf(yearsOff: number, mood: TalkMood): Stance {
  const found = STANCE_STEPS.findIndex((step) => yearsOff <= step.yearsOff);
  const base = found < 0 ? STANCE_STEPS.length : found;
  const harder = (mood.hasAskedToLeave ? 1 : 0) + (mood.offerFrom ? 1 : 0) + (mood.morale < SOUR_MORALE ? 1 : 0);
  return STANCES[Math.min(STANCES.length - 1, base + harder)] ?? "refuses";
}

/** What the length alone adds to his ask: nothing for the one he wants, more the further off it is. */
export const lengthPremium = (months: number, preferred: number): number => PREMIUM_PER_YEAR_SQUARED * ((months - preferred) / 12) ** 2;

/**
 * What a player asks for each contract length: `anchor` (the wage he'd take for the length he wants) plus the
 * length's premium, raised or cut by his mood; and how he takes each length.
 */
export function contractTerms(anchor: number, preferred: number, mood: TalkMood): ContractTerm[] {
  const moodFactor = 1 + (mood.hasAskedToLeave ? LEAVE_PREMIUM : 0) + (mood.offerFrom ? OFFER_PREMIUM : 0) + (50 - mood.morale) * MORALE_PREMIUM_PER_POINT;
  return CONTRACT_MONTHS.map((months) => ({
    months,
    wage: Math.max(1, Math.round(anchor * (1 + lengthPremium(months, preferred)) * moodFactor)),
    stance: stanceOf(Math.abs(months - preferred) / 12, mood),
  }));
}

/** The deal a club offers: the length nearest two years that the player wants or agrees to, the cheaper on a tie; null when he agrees to none. */
export function assistantPick(terms: readonly ContractTerm[]): ContractTerm | null {
  let best: ContractTerm | null = null;
  for (const term of terms) {
    if (term.stance !== "wants" && term.stance !== "agrees") continue;
    const off = Math.abs(term.months - USUAL_MONTHS);
    const bestOff = best ? Math.abs(best.months - USUAL_MONTHS) : Infinity;
    if (off < bestOff || (off === bestOff && best && term.wage < best.wage)) best = term;
  }
  return best;
}
