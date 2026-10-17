import { markingCards, type Marking } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { AGGRESSIVE_SHARE } from "../players/openingProfile.js";
import type { CardCount, MatchCards } from "./discipline.js";
import type { CardRates } from "./cardRates.js";

export type Booking = { playerId: string; clubId: string; card: "yellow" | "secondYellow" | "red"; minute: number };

// guess: an aggressive player is carded twice as often as others. No public rate exists; the base
// rate is scaled down so a lineup with the usual share of aggressive players keeps the real rate.
const AGGRESSIVE_CARDS = 2;
const AVERAGE_CARDS = 1 + AGGRESSIVE_SHARE * (AGGRESSIVE_CARDS - 1);
// Red cards come late: drawing the minute as 90·u^0.32 gives a mean of 68, the mean minute of the
// 2024–2025 Série A, B and cup red cards in data/history/espn/cards.csv (68.6, 68.2 and 66.6).
const RED_MINUTE_SKEW = 0.32;
const STARTERS = 11;

const MATCH_MINUTES = 90;

/** A red card's minute after `from`: the skewed draw, cut to the minutes left. */
function redMinute(random: () => number, from: number): number {
  const before = (from / MATCH_MINUTES) ** (1 / RED_MINUTE_SKEW);
  return Math.round(MATCH_MINUTES * (before + (1 - before) * random()) ** RED_MINUTE_SKEW);
}

/** Cards for the minutes after `from`; a player in `booked` already has a yellow, so another one sends him off. */
function sideCards(
  lineup: readonly SimPlayer[],
  rates: CardCount,
  secondYellowShare: number,
  random: () => number,
  from: number,
  booked: ReadonlySet<string>,
): Booking[] {
  const left = (MATCH_MINUTES - from) / MATCH_MINUTES;
  const yellowChance = rates.yellows / STARTERS / AVERAGE_CARDS;
  const straightRedChance = ((1 - secondYellowShare) * rates.reds) / STARTERS / AVERAGE_CARDS;
  // Each booked player gets a second yellow at the rate that gives the real share of second-yellow reds.
  const secondYellowChance = (secondYellowShare * rates.reds) / rates.yellows;
  const bookings: Booking[] = [];
  for (const player of lineup) {
    const temper = player.trait === "aggressive" ? AGGRESSIVE_CARDS : 1;
    const book = (card: Booking["card"], minute: number) => bookings.push({ playerId: player.id, clubId: player.clubId, card, minute });
    if (random() < straightRedChance * temper * left) {
      book("red", redMinute(random, from));
    } else if (random() < yellowChance * temper * left) {
      const minute = from + Math.round((MATCH_MINUTES - from) * random());
      if (booked.has(player.id)) {
        book("secondYellow", minute);
        continue;
      }
      book("yellow", minute);
      if (random() < secondYellowChance) book("secondYellow", minute + Math.round((MATCH_MINUTES - minute) * random()));
    }
  }
  return bookings;
}

/** The card rates of a match with each side's marking: heavy, or none, keeps the real rates. */
export function markedCardRates(rates: CardRates, marking: { home?: Marking; away?: Marking }): CardRates {
  const scaled = (count: CardCount, factor: number): CardCount => (factor === 1 ? count : { yellows: count.yellows * factor, reds: count.reds * factor });
  return { ...rates, home: scaled(rates.home, markingCards(marking.home)), away: scaled(rates.away, markingCards(marking.away)) };
}

/** Every card in a match, drawn before kick-off so the engine can play the sendings-off. */
export function drawCards(homeLineup: readonly SimPlayer[], awayLineup: readonly SimPlayer[], rates: CardRates, random: () => number): Booking[] {
  return drawCardsAfter(0, homeLineup, awayLineup, rates, new Set(), random);
}

/** The cards of the minutes after `minute`, for the players on the pitch then; `booked` already have a yellow. */
export function drawCardsAfter(
  minute: number,
  homeLineup: readonly SimPlayer[],
  awayLineup: readonly SimPlayer[],
  rates: CardRates,
  booked: ReadonlySet<string>,
  random: () => number,
): Booking[] {
  return [
    ...sideCards(homeLineup, rates.home, rates.secondYellowShare, random, minute, booked),
    ...sideCards(awayLineup, rates.away, rates.secondYellowShare, random, minute, booked),
  ];
}

const EXTRA_TIME_END = 120;

/**
 * The cards of extra time after `from` (90, its start) for the players on the pitch then, at the
 * minutes' share of a match's card rates, each at one of those minutes; `booked` already have a
 * yellow, so another one sends them off. guess: cards fall evenly over extra time, with no late skew for reds.
 */
export function drawExtraTimeCards(
  homeOnPitch: readonly SimPlayer[],
  awayOnPitch: readonly SimPlayer[],
  rates: CardRates,
  booked: ReadonlySet<string>,
  random: () => number,
  from: number = MATCH_MINUTES,
): Booking[] {
  const share = (EXTRA_TIME_END - from) / MATCH_MINUTES;
  const minuteOf = () => from + 1 + Math.floor(random() * (EXTRA_TIME_END - from));
  const side = (onPitch: readonly SimPlayer[], count: CardCount): Booking[] => {
    const yellowChance = count.yellows / STARTERS / AVERAGE_CARDS;
    const straightRedChance = ((1 - rates.secondYellowShare) * count.reds) / STARTERS / AVERAGE_CARDS;
    return onPitch.flatMap((player): Booking[] => {
      const temper = player.trait === "aggressive" ? AGGRESSIVE_CARDS : 1;
      const book = (card: Booking["card"]): Booking => ({ playerId: player.id, clubId: player.clubId, card, minute: minuteOf() });
      if (random() < straightRedChance * temper * share) return [book("red")];
      if (random() >= yellowChance * temper * share) return [];
      return [book(booked.has(player.id) ? "secondYellow" : "yellow")];
    });
  };
  return [...side(homeOnPitch, rates.home), ...side(awayOnPitch, rates.away)];
}

/** Yellows and reds per side; a second yellow counts as a red, its first yellow as a yellow. */
export function countCards(bookings: readonly Booking[], homeId: string): MatchCards {
  const cards: MatchCards = { home: { yellows: 0, reds: 0 }, away: { yellows: 0, reds: 0 } };
  for (const { clubId, card } of bookings) {
    const side = clubId === homeId ? cards.home : cards.away;
    if (card === "yellow") side.yellows++;
    else side.reds++;
  }
  return cards;
}

export function sendOffMinutes(bookings: readonly Booking[], homeId: string): { home: number[]; away: number[] } {
  const reds = bookings.filter((b) => b.card !== "yellow");
  return { home: reds.filter((b) => b.clubId === homeId).map((b) => b.minute), away: reds.filter((b) => b.clubId !== homeId).map((b) => b.minute) };
}
