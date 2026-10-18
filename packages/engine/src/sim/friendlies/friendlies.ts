import type { Club } from "@boleiro/data/clubs";
import { simulateMatch } from "../../engine/match.js";
import { CUP_PARAMS } from "../../engine/paramsForDivision.js";
import { keyedStream } from "../../engine/random.js";
import { copyRecord } from "../copyRecord.js";
import { addDays } from "../dates.js";
import { bookMoneyInDraft } from "../finances/bookMoney.js";
import { attendance } from "../finances/recordMatchFinances.js";
import { DERBY_OF_THE_AMERICAS } from "../continental/intercontinentalCup.js";
import type { Competition, Fixture, GameState, IsoDate } from "../gameState.js";
import { matchSetup } from "../players/matchSetup.js";
import { squadsByClub } from "../players/squadsByClub.js";

/**
 * A friendly the coach's club plays outside every competition; the host pays the visitor `fee`. A farewell
 * match for an idol (`farewellOf`) moves no money: the gate goes to the player.
 */
export type Friendly = {
  id: string;
  date: IsoDate;
  homeId: string;
  awayId: string;
  fee: number;
  result: { homeGoals: number; awayGoals: number } | null;
  farewellOf?: { playerId: string; name: string };
};

/** Why a friendly can't be booked: a date that isn't free for the coach, the other club busy, no such club, a host short of the fee, or a big club that won't travel to a small one. */
export type FriendlyRefusal = "date" | "busy" | "opponent" | "cash" | "refused";

export type FriendlyAnswer = { booked: true; friendly: Friendly } | { booked: false; reason: FriendlyRefusal };

/** A club asking the coach's club to visit, paying its fee. */
export type FriendlyOffer = { hostId: string; date: IsoDate; fee: number };

export type FriendlyPlayed = { type: "friendlyPlayed"; friendly: Friendly; gate: number };
/** Why a friendly is called off on its day: an official match took the date, the host can't pay the fee, or a club is gone. */
export type CallOffReason = "fixture" | "cash" | "club";
export type FriendlyCalledOff = { type: "friendlyCalledOff"; friendly: Friendly; reason: CallOffReason };
export type FriendlyEvent = FriendlyPlayed | FriendlyCalledOff;

// Flamengo, the club with the most fans, took a R$ 800 thousand fee to play a home game in Brasília
// (Correio Braziliense, "Flamengo ganha cachê de R$ 800 mil em Brasília"). guess: the biggest fanbase
// earns R$ 1 million a visit and the fee falls with the square root of the fanbase, so a club with a
// hundredth of the fans earns a tenth; Brasfoot's table also spans about 25 times from small to big.
const TOP_FEE = 1_000_000;
const MIN_FEE = 20_000;
// Brasfoot fills a friendly at 0.4 times a league game's demand (club-market-match.md, 3.4).
const FRIENDLY_DEMAND = 0.4;
// guess: a friendly needs a day of rest either side, and is booked up to two months ahead.
const REST_DAYS = 1;
const BOOKING_DAYS = 60;
// guess: a club with ten times the fans won't travel to the smaller ground (Brasfoot: a top club only visits a top club).
const TRAVEL_FANBASE_RATIO = 10;
// guess: one invitation at a time, for the next free date a club wants the coach's club.
const OFFERS_SHOWN = 1;
// Friendlies draw from streams of their own, so the day's official results stay as they were.
const FRIENDLY_STREAM_SALT = 0xf21e7d;
// The screen shows the last few friendlies played.
const PLAYED_KEPT = 5;

const biggestFanbase = new WeakMap<GameState["clubs"], number>();

function topFanbase(clubs: GameState["clubs"]): number {
  const known = biggestFanbase.get(clubs);
  if (known !== undefined) return known;
  const top = Math.max(1, ...Object.values(clubs).map((club) => club.fanbase));
  biggestFanbase.set(clubs, top);
  return top;
}

/** The appearance fee a club earns for visiting, from its fanbase against the biggest one in the game. */
export function friendlyFee(state: Pick<GameState, "clubs">, club: Club): number {
  const share = Math.sqrt(Math.max(0, club.fanbase) / Math.max(topFanbase(state.clubs), club.fanbase, 1));
  return Math.max(MIN_FEE, Math.round((TOP_FEE * share) / 10_000) * 10_000);
}

/** What booking a friendly reads of the game. */
export type BookingState = Pick<GameState, "date" | "season" | "fixtures" | "competitions" | "clubs" | "finances" | "friendlies" | "coachClubId">;

const clubsIn = (stage: Competition["stages"][number]) => (stage.kind === "groups" ? stage.groups.flat() : stage.ties.flat());

/** Whether a club plays a competition: entered in it, or drawn into one of its stages, as a Libertadores club dropping into the Sul-Americana. */
const isInCompetition = (competition: Competition, clubId: string) => competition.clubIds.includes(clubId) || competition.stages.some((stage) => clubsIn(stage).includes(clubId));

/** The days a competition may still want a club: all its stages' for a club in it, and the Intercontinental Cup's from the Derby of the Americas on for any club of the season's Libertadores, whose winner joins there. */
function datesWanted(state: BookingState, competition: Competition, clubId: string): IsoDate[] {
  if (isInCompetition(competition, clubId)) return competition.stageDates.flat();
  if (competition.kind !== "continental" || competition.cup !== "intercontinental-cup") return [];
  const isInLibertadores = Object.values(state.competitions).some((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === competition.season && isInCompetition(c, clubId));
  return isInLibertadores ? competition.stageDates.slice(DERBY_OF_THE_AMERICAS).flat() : [];
}

/** Whether a club has nothing on `date` or a day either side: no fixture, no stage its competitions may want it for, no friendly. */
export function isFree(state: BookingState, clubId: string, date: IsoDate): boolean {
  const near = new Set([addDays(date, -REST_DAYS), date, addDays(date, REST_DAYS)]);
  if (state.fixtures.some((f) => near.has(f.date) && (f.homeId === clubId || f.awayId === clubId))) return false;
  if ((state.friendlies ?? []).some((f) => near.has(f.date) && (f.homeId === clubId || f.awayId === clubId))) return false;
  return !Object.values(state.competitions).some((c) => datesWanted(state, c, clubId).some((d) => near.has(d)));
}

/** Whether `date` is after today, inside the booking window and this season. */
const isBookable = (state: BookingState, date: IsoDate): boolean =>
  date > state.date && date <= addDays(state.date, BOOKING_DAYS) && date.slice(0, 4) === String(state.season);

/** Dates over the next two months, inside the season, when the coach's club could play a friendly. */
export function freeFriendlyDates(state: BookingState): IsoDate[] {
  const clubId = state.coachClubId;
  if (!clubId) return [];
  const dates: IsoDate[] = [];
  for (let day = 1; day <= BOOKING_DAYS; day++) {
    const date = addDays(state.date, day);
    if (isBookable(state, date) && isFree(state, clubId, date)) dates.push(date);
  }
  return dates;
}

/** What the other club would answer to a friendly against the coach's club on `date`, without asking it. */
export function friendlyAnswer(state: BookingState, opponentId: string, date: IsoDate, isHome: boolean): FriendlyAnswer {
  const clubId = state.coachClubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  const opponent = state.clubs[opponentId];
  if (!clubId || !club) throw new Error("the coach has no club to play a friendly");
  if (!opponent || opponentId === clubId || !state.finances[opponentId]) return { booked: false, reason: "opponent" };
  if (!isBookable(state, date) || !isFree(state, clubId, date)) return { booked: false, reason: "date" };
  if (!isFree(state, opponentId, date)) return { booked: false, reason: "busy" };
  const [home, away] = isHome ? [club, opponent] : [opponent, club];
  if (away.fanbase > TRAVEL_FANBASE_RATIO * Math.max(1, home.fanbase)) return { booked: false, reason: "refused" };
  const fee = friendlyFee(state, away);
  if ((state.finances[home.id]?.cash ?? 0) < fee) return { booked: false, reason: "cash" };
  return { booked: true, friendly: { id: `friendly-${date}-${home.id}-${away.id}`, date, homeId: home.id, awayId: away.id, fee, result: null } };
}

/** The coach books a friendly for his club, at home or away; the fee is paid on the day. */
export function bookFriendly(state: GameState, opponentId: string, date: IsoDate, isHome: boolean): { state: GameState; answer: FriendlyAnswer } {
  const answer = friendlyAnswer(state, opponentId, date, isHome);
  if (!answer.booked) return { state, answer };
  return { state: { ...state, friendlies: [...(state.friendlies ?? []), answer.friendly] }, answer };
}

/**
 * Clubs inviting the coach's club to visit on its next free dates: one per date, picked among the
 * clubs free that day that can pay its fee, the same pick every time the screen asks.
 */
export function friendlyOffers(state: BookingState & Pick<GameState, "seed">): FriendlyOffer[] {
  const clubId = state.coachClubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  if (!clubId || !club) return [];
  const fee = friendlyFee(state, club);
  const offers: FriendlyOffer[] = [];
  for (const date of freeFriendlyDates(state)) {
    if (offers.length >= OFFERS_SHOWN) break;
    const hosts = Object.values(state.clubs)
      .filter((host) => friendlyAnswer(state, host.id, date, false).booked)
      .map((host) => host.id)
      .sort();
    const pick = keyedStream(state.seed ^ FRIENDLY_STREAM_SALT, `offer:${clubId}:${date}`)();
    const hostId = hosts[Math.floor(pick * hosts.length)];
    if (hostId) offers.push({ hostId, date, fee });
  }
  return offers;
}

/** The game without the unplayed friendlies of `clubId`, the club the coach has just left. */
export function dropCoachFriendlies(state: GameState, clubId: string): GameState {
  const friendlies = state.friendlies?.filter((f) => f.result || (f.homeId !== clubId && f.awayId !== clubId));
  return friendlies?.length === state.friendlies?.length ? state : { ...state, friendlies };
}

/** One friendly played: both sides at full strength in their usual shape, drawn on the friendly's own stream. */
function playFriendly(state: GameState, friendly: Friendly): Friendly["result"] {
  const fixture: Fixture = { id: friendly.id, competitionId: "friendly", stage: 0, date: friendly.date, homeId: friendly.homeId, awayId: friendly.awayId, result: null };
  const squads = squadsByClub(state.players);
  const setup = matchSetup(state, fixture, (clubId) => squads.get(clubId) ?? [], { lineup: null, tactics: state.coach.tactics });
  const { homeGoals, awayGoals } = simulateMatch(setup.home, setup.away, keyedStream(state.seed ^ FRIENDLY_STREAM_SALT, friendly.id), CUP_PARAMS);
  return { homeGoals, awayGoals };
}

/**
 * Plays the friendlies set for `date`: the host keeps the gate at a friendly's crowd and pays the
 * visitor's fee. One the season's matches have since taken over, or whose host can't pay the fee
 * any more, is called off and no money moves.
 */
export function playFriendlies(state: GameState, date: IsoDate): { state: GameState; events: FriendlyEvent[] } {
  const today = (state.friendlies ?? []).filter((f) => f.date === date && !f.result);
  if (!today.length) return { state, events: [] };
  const events: FriendlyEvent[] = [];
  const finances = copyRecord(state.finances);
  const done = new Map<string, Friendly | null>();
  for (const friendly of today) {
    const clash = state.fixtures.some((f) => f.date === date && [f.homeId, f.awayId].some((id) => id === friendly.homeId || id === friendly.awayId));
    const home = finances[friendly.homeId];
    const isGone = !home || !finances[friendly.awayId] || !state.clubs[friendly.homeId] || !state.clubs[friendly.awayId];
    // A farewell moves no money, so a club in the red still plays it.
    const reason: CallOffReason | null = isGone ? "club" : clash ? "fixture" : !friendly.farewellOf && home.cash < friendly.fee ? "cash" : null;
    if (reason || !home) {
      events.push({ type: "friendlyCalledOff", friendly, reason: reason ?? "club" });
      done.set(friendly.id, null);
      continue;
    }
    const played = { ...friendly, result: playFriendly(state, friendly) };
    if (friendly.farewellOf) {
      events.push({ type: "friendlyPlayed", friendly: played, gate: 0 });
      done.set(friendly.id, played);
      continue;
    }
    const crowd = Math.round(FRIENDLY_DEMAND * attendance(state, home, friendly.homeId, friendly.awayId));
    const gate = Math.round(crowd * home.ticketPrice);
    bookMoneyInDraft(finances, friendly.homeId, { revenue: "tickets", amount: gate });
    bookMoneyInDraft(finances, friendly.homeId, { cost: "friendlies", amount: friendly.fee });
    bookMoneyInDraft(finances, friendly.awayId, { revenue: "friendlies", amount: friendly.fee });
    events.push({ type: "friendlyPlayed", friendly: played, gate });
    done.set(friendly.id, played);
  }
  const kept = (state.friendlies ?? []).flatMap((f) => {
    const after = done.has(f.id) ? done.get(f.id) : f;
    return after ? [after] : [];
  });
  const played = kept.filter((f) => f.result);
  const friendlies = [...played.slice(-PLAYED_KEPT), ...kept.filter((f) => !f.result)];
  return { state: { ...state, finances, friendlies }, events };
}
