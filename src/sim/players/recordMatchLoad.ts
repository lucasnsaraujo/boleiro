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

/** Fatigue, minutes, points and injuries for everyone who played a match. Returns only the players that changed. */
export function recordMatchLoad(match: MatchLoad, random: () => number): { players: SimPlayer[]; events: PlayerInjured[] } {
  const events: PlayerInjured[] = [];
  const { date } = match.context;
  const update = (player: SimPlayer, home: boolean): SimPlayer => {
    const travel = home ? 0 : (TRAVEL_LOAD_PER_1000_KM * match.awayTravelKm) / 1000;
    let injuredUntil = player.condition.injuredUntil;
    if (random() < matchInjuryChance(player, match.context)) {
      const days = injuryLayoffDays(random);
      injuredUntil = addDays(date, days);
      events.push({ type: "playerInjured", playerId: player.id, clubId: player.clubId, days, fitOn: injuredUntil });
    }
    return {
      ...player,
      condition: {
        ...player.condition,
        fatigue: fatigueOn(player, date) + MATCH_LOAD + travel,
        fatigueOn: date,
        injuredUntil,
        seasonMinutes: player.condition.seasonMinutes + MATCH_MINUTES,
        seasonPoints: player.condition.seasonPoints + pointsFor(match.result, home),
      },
    };
  };
  const players = [...match.homeLineup.map((p) => update(p, true)), ...match.awayLineup.map((p) => update(p, false))];
  return { players, events };
}
