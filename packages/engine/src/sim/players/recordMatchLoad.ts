import { keyedStream } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { IsoDate, MatchResult, SimPlayer } from "../gameState.js";
import type { MatchContext } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";
import { drawInjury, matchInjuryChance, type Injury, type InjuryKind } from "./matchInjuryChance.js";

/** `kind` is what the injury is; `isRecurrence` marks the player's last injury coming back. */
export type PlayerInjured = { type: "playerInjured"; playerId: string; clubId: string; days: number; fitOn: IsoDate; kind?: InjuryKind; isRecurrence?: true };

const MATCH_MINUTES = 90;
// One full match is the unit of fatigue.
const MATCH_LOAD = 100;
// guess: fatigue per 1000 km of away travel, so a 3,000 km trip (Porto Alegre to Manaus) weighs
// about a fifth of a match. Away travel and its sleep loss slow recovery (Fowler et al. 2015,
// Int J Sports Physiol Perform 10(5):546–552) but no study puts a number on it per km.
const TRAVEL_LOAD_PER_1000_KM = 7;
// What an injury is and how long it lasts come from a stream of their own per match and player.
const INJURY_STREAM_SALT = 0x1e5104;

/** The stream an injury in `fixtureId` draws its kind and days from, per player: the same at kick-off and in a redraw. */
export function injuryStreamOf(seed: number, fixtureId: string): (playerId: string) => () => number {
  return (playerId) => keyedStream(seed ^ INJURY_STREAM_SALT, `${fixtureId}:${playerId}`);
}

export type MatchLoad = {
  result: MatchResult;
  context: MatchContext;
  homeLineup: readonly SimPlayer[];
  awayLineup: readonly SimPlayer[];
  awayTravelKm: number;
};

function pointsFor(result: MatchResult, home: boolean): number {
  const diff = home ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
  return diff > 0 ? 3 : diff === 0 ? 1 : 0;
}

/**
 * Who gets injured in a match, drawn for each player in order from `random`; what each injury is and
 * how long it lasts come from the player's own stream (`injuryStream`), so the match's other draws stay put.
 */
export function drawMatchInjuries(
  players: readonly SimPlayer[],
  context: MatchContext,
  random: () => number,
  injuryStream: (playerId: string) => () => number,
): Map<string, Injury> {
  const injuries = new Map<string, Injury>();
  for (const player of players) {
    if (random() < matchInjuryChance(player, context)) injuries.set(player.id, drawInjury(player, context.date, injuryStream(player.id)));
  }
  return injuries;
}

/**
 * Fatigue, minutes, points and injuries (drawn by drawMatchInjuries) for everyone who played a match.
 * `minutes` gives the minutes of players who did not play the whole match; their fatigue grows in
 * proportion. Returns only the players that changed.
 */
export function recordMatchLoad(
  match: MatchLoad,
  injuries: ReadonlyMap<string, Injury>,
  minutes: ReadonlyMap<string, number> = new Map(),
): { players: SimPlayer[]; events: PlayerInjured[] } {
  const events: PlayerInjured[] = [];
  const { date } = match.context;
  const update = (player: SimPlayer, home: boolean): SimPlayer => {
    const travel = home ? 0 : (TRAVEL_LOAD_PER_1000_KM * match.awayTravelKm) / 1000;
    const played = minutes.get(player.id) ?? MATCH_MINUTES;
    let injuredUntil = player.condition.injuredUntil;
    const injury = injuries.get(player.id);
    if (injury) {
      injuredUntil = addDays(date, injury.days);
      events.push({ type: "playerInjured", playerId: player.id, clubId: player.clubId, days: injury.days, fitOn: injuredUntil, kind: injury.kind, ...(injury.isRecurrence ? { isRecurrence: true as const } : {}) });
    }
    return {
      ...player,
      condition: {
        ...player.condition,
        ...(injury ? { injury: injury.kind } : {}),
        fatigue: fatigueOn(player, date) + (MATCH_LOAD * played) / MATCH_MINUTES + travel,
        fatigueOn: date,
        injuredUntil,
        seasonMinutes: player.condition.seasonMinutes + played,
        seasonPoints: player.condition.seasonPoints + pointsFor(match.result, home),
      },
    };
  };
  const players = [...match.homeLineup.map((p) => update(p, true)), ...match.awayLineup.map((p) => update(p, false))];
  return { players, events };
}
