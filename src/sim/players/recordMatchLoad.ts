import { addDays } from "../dates.js";
import type { IsoDate, MatchResult, SimPlayer } from "../gameState.js";
import type { MatchContext } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";
import { injuryLayoffDays, matchInjuryChance } from "./matchInjuryChance.js";

export type PlayerInjured = { type: "playerInjured"; playerId: string; clubId: string; days: number; fitOn: IsoDate };

const MATCH_MINUTES = 90;
// One full match is the unit of fatigue.
const MATCH_LOAD = 100;
// guess: fatigue per 1000 km of away travel, so a 3,000 km trip (Porto Alegre to Manaus) weighs
// about a fifth of a match. Away travel and its sleep loss slow recovery (Fowler et al. 2015,
// Int J Sports Physiol Perform 10(5):546–552) but no study puts a number on it per km.
const TRAVEL_LOAD_PER_1000_KM = 7;

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

/** Who gets injured in a match, drawn for each player in order: player id to days out. */
export function drawMatchInjuries(players: readonly SimPlayer[], context: MatchContext, random: () => number): Map<string, number> {
  const injuries = new Map<string, number>();
  for (const player of players) {
    if (random() < matchInjuryChance(player, context)) injuries.set(player.id, injuryLayoffDays(random));
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
  injuries: ReadonlyMap<string, number>,
  minutes: ReadonlyMap<string, number> = new Map(),
): { players: SimPlayer[]; events: PlayerInjured[] } {
  const events: PlayerInjured[] = [];
  const { date } = match.context;
  const update = (player: SimPlayer, home: boolean): SimPlayer => {
    const travel = home ? 0 : (TRAVEL_LOAD_PER_1000_KM * match.awayTravelKm) / 1000;
    const played = minutes.get(player.id) ?? MATCH_MINUTES;
    let injuredUntil = player.condition.injuredUntil;
    const days = injuries.get(player.id);
    if (days !== undefined) {
      injuredUntil = addDays(date, days);
      events.push({ type: "playerInjured", playerId: player.id, clubId: player.clubId, days, fitOn: injuredUntil });
    }
    return {
      ...player,
      condition: {
        ...player.condition,
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
