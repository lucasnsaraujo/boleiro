import type { GameState, SimPlayer } from "../gameState.js";
import { takeInOutsiders } from "../nations/callUps.js";
import type { CountryStart } from "../newGame.js";
import type { Guests } from "./guests.js";
import type { WorldClub } from "./world.js";

/** Each player's citizenships by name, as the club's shipped pack lists them. */
type Citizenships = ReadonlyMap<string, string>;

function citizenshipsOf(club: WorldClub): Citizenships {
  return new Map((club.names ?? []).map((name, i) => [name, club.nationalities?.[i] ?? ""]));
}

/** The club with each player's citizenships from its pack, by name; empty for a player the pack doesn't name. */
function withCitizenships(club: WorldClub, known: Citizenships | undefined): WorldClub {
  if (club.nationalities || !known) return club;
  return { ...club, nationalities: club.strengths.map((_, i) => known.get(club.names?.[i] ?? "") ?? "") };
}

/**
 * A game saved before the world kept its players' citizenships, with them from the shipped packs (`files`):
 * each result-only club's and Club World Cup guest's players by name, and the full tier's players at a club
 * abroad by club and name, who join their national pools. A game that has them, or one with no world, stays the same object.
 */
export function withWorldNationalities(state: GameState, files: { world?: readonly CountryStart[]; guests?: Guests }): GameState {
  const countries = Object.values(state.world ?? {});
  const isOld = countries.some((country) => Object.values(country.clubs).some((club) => !club.nationalities));
  if (!isOld) return state;
  const packed = new Map<string, Citizenships>();
  for (const { levels } of files.world ?? []) for (const club of levels.flat()) packed.set(club.id, citizenshipsOf(club));
  for (const club of Object.values(files.guests ?? {}).flat()) packed.set(club.id, citizenshipsOf(club));
  const world = Object.fromEntries(
    Object.entries(state.world ?? {}).map(([id, country]) => [id, { ...country, clubs: Object.fromEntries(Object.entries(country.clubs).map(([clubId, club]) => [clubId, withCitizenships(club, packed.get(clubId))])) }]),
  );
  const guests = state.guests && Object.fromEntries(Object.entries(state.guests).map(([id, clubs]) => [id, clubs.map((club) => withCitizenships(club, packed.get(club.id)))]));
  const players: Record<string, SimPlayer> = {};
  const given: SimPlayer[] = [];
  for (const [id, player] of Object.entries(state.players)) {
    const known = state.clubs[player.clubId]?.abroad && !player.nationalities.length ? packed.get(player.clubId)?.get(player.name) : undefined;
    players[id] = known ? { ...player, nationalities: known.split("/").filter(Boolean) } : player;
    if (known) given.push(players[id]);
  }
  // Players abroad given their citizenships join their national pools as the game's own, no longer as outsiders.
  const nations = state.nations && takeInOutsiders(state.nations, given);
  return { ...state, world, players, ...(guests ? { guests } : {}), ...(nations ? { nations } : {}) };
}
