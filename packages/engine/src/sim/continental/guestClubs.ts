import type { PositionGroup } from "@boleiro/data/players";
import type { GameState, SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import type { World, WorldClub } from "../world/world.js";

const GROUP_OF: Record<string, PositionGroup> = { G: "GK", D: "DEF", M: "MID", A: "ATT" };
// guess: a guest's players all play at 26, the median age of Brazil's squads, whatever their years of birth: age changes nothing in a match.
const UNKNOWN_AGE = 26;
const NEVER = "9999-12-31";
const RESTED_SINCE = "2000-01-01";

const clubsByWorld = new WeakMap<World, Map<string, WorldClub>>();
const squads = new WeakMap<WorldClub, SimPlayer[]>();

/** A club of a result-only country, or a Club World Cup guest, by id, when it meets the full tier in a continental cup; null for any other id. */
export function guestClubOf(state: Pick<GameState, "world" | "guests">, clubId: string): WorldClub | null {
  const { world, guests } = state;
  const guest = guests && Object.values(guests).flat().find((club) => club.id === clubId);
  if (guest) return guest;
  if (!world) return null;
  let clubs = clubsByWorld.get(world);
  if (!clubs) {
    clubs = new Map(Object.values(world).flatMap((country) => Object.values(country.clubs).map((club) => [club.id, club] as const)));
    clubsByWorld.set(world, clubs);
  }
  return clubs.get(clubId) ?? null;
}

/**
 * A guest club's squad as the full tier plays it: its players at their strength, always rested and
 * never on a wage or a contract, since only the result-only tier owns them. Their ids, `<club>#<n>`,
 * are none of the game's players.
 */
export function guestSquadOf(club: WorldClub): SimPlayer[] {
  const known = squads.get(club);
  if (known) return known;
  const squad = club.strengths.map((strength, i): SimPlayer => ({
    id: `${club.id}#${i}`,
    clubId: club.id,
    name: club.names?.[i] ?? `${club.name} ${i + 1}`,
    group: GROUP_OF[club.positions[i] ?? ""] ?? "MID",
    strength,
    wage: 0,
    contractUntil: NEVER,
    age: UNKNOWN_AGE,
    nationalities: [],
    trait: null,
    condition: freshCondition(RESTED_SINCE),
  }));
  squads.set(club, squad);
  return squad;
}
