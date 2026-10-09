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

const redMinute = (random: () => number) => Math.round(90 * random() ** RED_MINUTE_SKEW);

function sideCards(lineup: readonly SimPlayer[], rates: CardCount, secondYellowShare: number, random: () => number): Booking[] {
  const yellowChance = rates.yellows / STARTERS / AVERAGE_CARDS;
  const straightRedChance = ((1 - secondYellowShare) * rates.reds) / STARTERS / AVERAGE_CARDS;
  // Each booked player gets a second yellow at the rate that gives the real share of second-yellow reds.
  const secondYellowChance = (secondYellowShare * rates.reds) / rates.yellows;
  const bookings: Booking[] = [];
  for (const player of lineup) {
    const temper = player.trait === "aggressive" ? AGGRESSIVE_CARDS : 1;
    const book = (card: Booking["card"], minute: number) => bookings.push({ playerId: player.id, clubId: player.clubId, card, minute });
    if (random() < straightRedChance * temper) {
      book("red", redMinute(random));
    } else if (random() < yellowChance * temper) {
      const minute = Math.round(90 * random());
      book("yellow", minute);
      if (random() < secondYellowChance) book("secondYellow", minute + Math.round((90 - minute) * random()));
    }
  }
  return bookings;
}

/** Every card in a match, drawn before kick-off so the engine can play the sendings-off. */
export function drawCards(homeLineup: readonly SimPlayer[], awayLineup: readonly SimPlayer[], rates: CardRates, random: () => number): Booking[] {
  return [
    ...sideCards(homeLineup, rates.home, rates.secondYellowShare, random),
    ...sideCards(awayLineup, rates.away, rates.secondYellowShare, random),
  ];
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
