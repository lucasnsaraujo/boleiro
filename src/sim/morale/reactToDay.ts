import { bookMoney } from "../finances/bookMoney.js";
import type { FinanceEvent } from "../finances/closeMonth.js";
import { tierOf } from "../finances/tierOf.js";
import type { Fixture, GameState } from "../gameState.js";
import { clubMood, type ClubMood } from "./clubMood.js";
import { escalateSupporters, type SupporterEvent } from "./escalateSupporters.js";
import { rivalsOf } from "./rivalsOf.js";

// guess: the league average points per game when a quarter of games are drawn, as in developPlayers.
const AVERAGE_POINTS = 1.35;
// guess: how much of the gap to neutral (50) fans and squad keep after each match; about the
// last ten games count.
const MEMORY = 0.9;
// guess: mood points per league point above the average, for fans and for the squad.
const FAN_SWING = 4;
const SQUAD_SWING = 3;
// guess: a derby counts double for the fans.
const DERBY_WEIGHT = 2;
// guess: fan mood points when a rival wins (lost) or loses (gained) a game against someone else.
const RIVAL_RESULT = 1;
// guess: monthly fan mood points per 100% the ticket price sits above the division's average,
// capped either way.
const PRICE_SWING = 3;
// guess: squad morale lost at each closing with wages owed, growing with the months late up to three.
const LATE_WAGES_MORALE = 5;
const LATE_WAGES_MAX_MONTHS = 3;
// guess: fan mood lost when the board sells a player on its own to cover wages.
const FORCED_SALE_FANS = 3;

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const remember = (value: number) => 50 + (value - 50) * MEMORY;
const pointsOf = (fixture: Fixture, clubId: string): number => {
  if (!fixture.result) return AVERAGE_POINTS;
  const { homeGoals, awayGoals } = fixture.result;
  const diff = clubId === fixture.homeId ? homeGoals - awayGoals : awayGoals - homeGoals;
  return diff > 0 ? 3 : diff === 0 ? 1 : 0;
};

/**
 * How squads and fans take the day's matches and monthly closings, then how far each touched
 * club's organised supporters escalate. Clubs with disorder pay their fine at once.
 */
export function reactToDay(
  state: GameState,
  played: readonly Fixture[],
  financeEvents: readonly FinanceEvent[],
  random: () => number,
): { state: GameState; events: SupporterEvent[] } {
  if (!played.length && !financeEvents.length) return { state, events: [] };
  const moods = new Map<string, ClubMood>();
  const moodOf = (id: string) => moods.get(id) ?? clubMood(state, id);
  const change = (id: string, update: (mood: ClubMood) => Partial<ClubMood>) => {
    const mood = moodOf(id);
    moods.set(id, { ...mood, ...update(mood) });
  };
  const lost = new Set<string>();
  const rivals = played.length ? rivalsOf(state.clubs) : new Map<string, ReadonlySet<string>>();

  for (const fixture of played) {
    change(fixture.homeId, (mood) => ({ closedDoorGames: Math.max(0, mood.closedDoorGames - 1) }));
    for (const [id, opponent] of [[fixture.homeId, fixture.awayId], [fixture.awayId, fixture.homeId]] as const) {
      const above = pointsOf(fixture, id) - AVERAGE_POINTS;
      const derby = rivals.get(id)?.has(opponent) ? DERBY_WEIGHT : 1;
      if (pointsOf(fixture, id) === 0) lost.add(id);
      change(id, (mood) => ({
        fans: clamp(remember(mood.fans) + FAN_SWING * above * derby),
        squad: clamp(remember(mood.squad) + SQUAD_SWING * above),
      }));
      const swing = Math.sign(above) * (pointsOf(fixture, id) === 1 ? 0 : RIVAL_RESULT);
      for (const rival of rivals.get(id) ?? []) {
        if (rival !== opponent && swing) change(rival, (mood) => ({ fans: clamp(mood.fans - swing) }));
      }
    }
  }

  for (const event of financeEvents) {
    if (event.type === "wagesLate") {
      const cost = LATE_WAGES_MORALE * Math.min(LATE_WAGES_MAX_MONTHS, event.months);
      change(event.clubId, (mood) => ({ squad: clamp(mood.squad - cost) }));
    } else if (event.type === "forcedSale") {
      change(event.clubId, (mood) => ({ fans: clamp(mood.fans - FORCED_SALE_FANS) }));
    } else {
      const club = state.clubs[event.clubId];
      const finance = state.finances[event.clubId];
      if (!club || !finance) continue;
      const above = finance.ticketPrice / state.economy.matchday[tierOf(club)].price - 1;
      const swing = Math.min(PRICE_SWING, Math.max(-PRICE_SWING, -PRICE_SWING * above));
      change(event.clubId, (mood) => ({ fans: clamp(mood.fans + swing) }));
    }
  }

  const events: SupporterEvent[] = [];
  let next = state;
  const mood = { ...state.mood };
  for (const [clubId, changed] of [...moods].sort(([a], [b]) => a.localeCompare(b))) {
    const escalated = escalateSupporters(clubId, changed, lost.has(clubId), random);
    mood[clubId] = escalated.mood;
    events.push(...escalated.events);
    if (escalated.fine) next = bookMoney(next, clubId, { cost: "fines", amount: escalated.fine });
  }
  return { state: { ...next, mood }, events };
}
