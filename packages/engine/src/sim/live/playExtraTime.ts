import { keyedStream } from "../../engine/random.js";
import { scoringFactor } from "../../engine/sendOffRates.js";
import type { CardRates } from "../discipline/cardRates.js";
import { drawExtraTimeCards, type Booking } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import { scorersOf } from "../history/scorersOf.js";
import type { MatchContext } from "../players/effectiveStrength.js";
import { injuryLayoffDays, matchInjuryChance } from "../players/matchInjuryChance.js";
import { EXTRA_TIME_SUBSTITUTIONS, MAX_SUBSTITUTIONS, onPitchAt, whoPlayed } from "./aiSubstitutions.js";
import { describeGoals, type GoalEvent, type GoalSide } from "./goalDetails.js";
import { EXTRA_HALF_TIME, EXTRA_TIME_END, FULL_TIME, inMatchOrder, lastAction, scorersFor, sentOffMinute, whistlesTo, type KickOffTimeline, type MatchEvent } from "./matchTimeline.js";

type Side = "home" | "away";
type Sides<T> = { home: T; away: T };

const EXTRA_TIME_MINUTES = EXTRA_TIME_END - FULL_TIME;
// Extra time draws from a stream of its own, so a match that goes to it leaves every other draw of the day as it was.
const EXTRA_TIME_STREAM_SALT = 0xe7a17e;

export function extraTimeStream(seed: number, fixtureId: string): () => number {
  return keyedStream(seed ^ EXTRA_TIME_STREAM_SALT, fixtureId);
}

export type ExtraTimeMatch = {
  clubIds: Sides<string>;
  starters: Sides<readonly SimPlayer[]>;
  /** Who may come on for each side. */
  benches: Sides<readonly SimPlayer[]>;
  /** The sides whose AI coach makes substitutions. */
  aiSides: Sides<boolean>;
  penaltyTakers: Sides<string | null>;
  strength: (player: SimPlayer) => number;
  tiredness: (player: SimPlayer) => number;
  /** Each side's expected goals over extra time with eleven men against eleven. */
  expectedGoals: Sides<number>;
  cardRates: CardRates;
  context: MatchContext;
};

/**
 * Extra time after minute `from` (90, its start, unless a coach changed his side during it), on top
 * of what happened up to then (`events`): each AI side's extra substitution in the break before it,
 * then cards, injuries and goals minute by minute (a red card costing its side as in normal time),
 * the goals' kinds and assists, and a hurt player replaced while an AI side has a substitution left.
 * Returns only what it adds, its whistles left out.
 * guess: an AI coach spends the extra substitution in the break on his most tired outfielder, like for like.
 */
export function playExtraTime(match: ExtraTimeMatch, events: readonly MatchEvent[], random: () => number, from: number = FULL_TIME): MatchEvent[] {
  const sides: Side[] = ["home", "away"];
  const added: MatchEvent[] = [];
  const all = () => [...events, ...added];
  const onPitch = (side: Side, minute: number) => onPitchAt(match.starters[side], match.benches[side], all(), match.clubIds[side], minute);
  const subsOf = (side: Side) => all().filter((e) => e.type === "substitution" && e.clubId === match.clubIds[side]);
  const usedOf = (side: Side) => new Set(subsOf(side).flatMap((e) => (e.type === "substitution" ? [e.playerId, e.offId] : [])));
  const subsLeft = (side: Side) => MAX_SUBSTITUTIONS + EXTRA_TIME_SUBSTITUTIONS - subsOf(side).length;
  const freeBench = (side: Side) => match.benches[side].filter((p) => !usedOf(side).has(p.id)).sort((a, b) => b.strength - a.strength);
  const substitute = (side: Side, minute: number, off: SimPlayer) => {
    const on = freeBench(side).find((p) => p.group === off.group) ?? freeBench(side)[0];
    if (on && subsLeft(side) > 0) added.push({ type: "substitution", minute, clubId: match.clubIds[side], playerId: on.id, offId: off.id });
  };

  for (const side of sides) {
    const isBreakSubMade = subsOf(side).some((e) => e.minute === FULL_TIME);
    if (!match.aiSides[side] || from > FULL_TIME || isBreakSubMade) continue;
    const tired = onPitch(side, FULL_TIME + 1)
      .filter((p) => p.group !== "GK")
      .sort((a, b) => match.tiredness(b) - match.tiredness(a))[0];
    if (tired) substitute(side, FULL_TIME, tired);
  }

  const hurt = new Set(all().flatMap((e) => (e.type === "injury" ? [e.playerId] : [])));
  const fit = (side: Side) => onPitch(side, from + 1).filter((p) => !hurt.has(p.id) && sentOffMinute(all(), p.id) === undefined);
  const start = { home: fit("home"), away: fit("away") };
  const booked = new Set(all().flatMap((e) => (e.type === "card" && e.card === "yellow" ? [e.playerId] : [])));
  const cards: MatchEvent[] = drawExtraTimeCards(start.home, start.away, match.cardRates, booked, random, from).map((b) => ({ type: "card", ...b }));
  added.push(...cards);
  const injuries: MatchEvent[] = [...start.home, ...start.away].flatMap((player): MatchEvent[] => {
    if (random() >= matchInjuryChance(player, match.context) * ((EXTRA_TIME_END - from) / FULL_TIME)) return [];
    const days = injuryLayoffDays(random);
    const earliest = Math.max(from + 1, ...cards.flatMap((e) => (e.type === "card" && e.playerId === player.id ? [e.minute] : [])));
    const latest = sentOffMinute(cards, player.id) ?? EXTRA_TIME_END;
    return [{ type: "injury", minute: earliest + Math.floor(random() * (latest - earliest + 1)), clubId: player.clubId, playerId: player.id, days }];
  });
  added.push(...injuries);

  const reds = (side: Side) => all().flatMap((e) => (e.type === "card" && e.card !== "yellow" && e.clubId === match.clubIds[side] ? [e.minute] : []));
  const injuredAt = new Map(injuries.flatMap((e) => (e.type === "injury" ? [[e.playerId, e.minute] as const] : [])));
  const drawn: GoalEvent[] = [];
  for (let minute = from + 1; minute <= EXTRA_TIME_END; minute++) {
    for (const side of sides) {
      const other: Side = side === "home" ? "away" : "home";
      const down = (s: Side) => reds(s).filter((red) => red < minute).length;
      const mean = (match.expectedGoals[side] / EXTRA_TIME_MINUTES) * scoringFactor(down(side), down(other));
      const scorers = start[side].filter((p) => (sentOffMinute(all(), p.id) ?? Infinity) >= minute && (injuredAt.get(p.id) ?? Infinity) >= minute);
      const count = random() < 1 - Math.exp(-mean) ? 1 : 0;
      for (const playerId of scorersOf(scorers, count, random)) drawn.push({ type: "goal", minute, clubId: match.clubIds[side], playerId });
    }
  }
  const goalSide = (side: Side): GoalSide => ({ clubId: match.clubIds[side], onPitch: (minute) => onPitch(side, minute), penaltyTakerId: match.penaltyTakers[side] });
  const goals = describeGoals(drawn, { home: goalSide("home"), away: goalSide("away") }, match.strength, random);
  added.push(...goals);

  // Extra time's one opportunity: a second hurt player at another minute stays on.
  const windowOf = (side: Side) => subsOf(side).find((e) => e.minute > FULL_TIME && e.minute !== EXTRA_HALF_TIME)?.minute;
  for (const injury of injuries) {
    if (injury.type !== "injury") continue;
    const side: Side = injury.clubId === match.clubIds.home ? "home" : "away";
    const hurt = onPitch(side, injury.minute).find((p) => p.id === injury.playerId);
    const window = windowOf(side);
    const isWindowFree = window === undefined || window === injury.minute;
    if (match.aiSides[side] && hurt && isWindowFree && lastAction(all(), hurt.id) <= injury.minute) substitute(side, injury.minute, hurt);
  }
  return added;
}

/** A match's timeline with its extra time added: every event in order, and who played, for how long and who scored, over 120 minutes. */
export function withExtraTime(timeline: KickOffTimeline, extra: readonly MatchEvent[], match: Pick<ExtraTimeMatch, "clubIds" | "starters" | "benches">): KickOffTimeline {
  const events = inMatchOrder([...timeline.events, ...extra, ...whistlesTo(EXTRA_TIME_END).filter((w) => w.minute > FULL_TIME)]);
  const played = (side: Side) => whoPlayed(match.starters[side], match.benches[side], events, match.clubIds[side], EXTRA_TIME_END);
  const home = played("home");
  const away = played("away");
  return {
    events,
    scorers: { home: scorersFor(events, match.clubIds.home), away: scorersFor(events, match.clubIds.away) },
    played: { home: home.players, away: away.players },
    minutes: new Map([...home.minutes, ...away.minutes]),
  };
}

/** The cards of a timeline's events as bookings. */
export function bookingsOf(events: readonly MatchEvent[]): Booking[] {
  return events.flatMap((e) => (e.type === "card" ? [{ playerId: e.playerId, clubId: e.clubId, card: e.card, minute: e.minute }] : []));
}
