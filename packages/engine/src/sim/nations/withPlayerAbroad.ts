import type { IsoDate, SimPlayer } from "../gameState.js";
import { PEAK_VALUE_AGE } from "../transfers/valuePlayer.js";
import { poolBar, roleOf, standingOf, teamOfNationality } from "./callUps.js";
import { ROLE_LETTERS, type Nations } from "./nations.js";

// The pool lists a player sold abroad without his new club, which the game doesn't follow.
const CLUB_ABROAD = "Exterior";

/**
 * National football after a player of the game left for a club abroad: he joins his national team's pool abroad
 * when he rates at least as high as its weakest callable player, rated by his market value as the pool is but
 * without a young player's premium, which the pool would keep after he has grown out of it (strengths there don't
 * change). A veteran sold to a lesser league stays out. New rows go at the end, as call-ups name outsiders by row.
 */
export function withPlayerAbroad(nations: Nations, player: SimPlayer, date: IsoDate): Nations {
  const nationality = player.nationalities[0];
  const teamId = nationality ? teamOfNationality(nationality, nations.teams) : null;
  const pool = teamId ? nations.outsiders[teamId] : undefined;
  const rating = standingOf({ ...player, age: Math.max(PEAK_VALUE_AGE, player.age) });
  if (!teamId || !pool || rating < poolBar(pool, date)) return nations;
  const joined = {
    names: [...pool.names, player.name],
    roles: pool.roles + ROLE_LETTERS[roleOf(player)],
    strengths: [...pool.strengths, rating],
    born: [...pool.born, Number(date.slice(0, 4)) - player.age],
    clubs: [...pool.clubs, CLUB_ABROAD],
    clubIds: [...pool.clubIds, ""],
  };
  return { ...nations, outsiders: { ...nations.outsiders, [teamId]: joined } };
}
