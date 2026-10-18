import { GROUP_OF_ROLE } from "@boleiro/data/players";
import { DEFAULT_TACTICS, type Tactics } from "../coach/tactics.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { formationOf } from "../players/usualLineups.js";
import { OUTSIDER_MARK, ROLE_OF_LETTER, splitRefs } from "./callUps.js";
import { callUpRefsOf } from "./nationalJobs.js";
import { humanNationalJobOf } from "./nationalFixtures.js";

// guess: an outsider with no year of birth in the pack plays at 26, as a guest club's players do.
const UNKNOWN_AGE = 26;
const NEVER = "9999-12-31";
const RESTED_SINCE = "2000-01-01";

const squads = new WeakMap<GameState, Map<string, SimPlayer[]>>();

/** Whether an id is a national team's. */
export const isNationalTeam = (state: Pick<GameState, "nations">, id: string): boolean => state.nations?.teams[id] !== undefined;

/**
 * A national team's squad as the full tier plays it on the game's day: its call-up (its coach's pick on the day
 * when it has none running), the game's own players as the team's for the match and its pool's others from
 * abroad, `<team>~<row>`, always rested and never on a wage, since only the pool owns them. The same players for
 * the same game, so a lineup and its bench can be told apart by who they are.
 */
export function nationalSquadOf(state: GameState, teamId: string): SimPlayer[] {
  let byTeam = squads.get(state);
  if (!byTeam) squads.set(state, (byTeam = new Map()));
  const known = byTeam.get(teamId);
  if (known) return known;
  const nations = state.nations;
  if (!nations?.teams[teamId]) return [];
  const callUp = nations.callUps[teamId] ?? splitRefs(callUpRefsOf(state, nations, teamId, state.date));
  const own = callUp.playerIds.flatMap((id) => (state.players[id] ? [{ ...state.players[id], clubId: teamId }] : []));
  const others = callUp.outsiders.flatMap((row) => outsiderPlayerOf(state, teamId, row) ?? []);
  const squad = [...own, ...others];
  byTeam.set(teamId, squad);
  return squad;
}

/** One of a national team's pool from abroad as a match fields him: `<team>~<row>`. */
function outsiderPlayerOf(state: Pick<GameState, "nations" | "date">, teamId: string, row: number): SimPlayer | null {
  const pool = state.nations?.outsiders[teamId];
  const name = pool?.names[row];
  if (!pool || name === undefined) return null;
  const role = ROLE_OF_LETTER[pool.roles[row] ?? "m"] ?? "meia";
  const born = pool.born[row] ?? 0;
  return {
    id: `${teamId}${OUTSIDER_MARK}${row}`,
    clubId: teamId,
    name,
    group: GROUP_OF_ROLE[role],
    positions: [role],
    strength: pool.strengths[row] ?? 0,
    wage: 0,
    contractUntil: NEVER,
    age: born ? Number(state.date.slice(0, 4)) - born : UNKNOWN_AGE,
    nationalities: [],
    trait: null,
    condition: freshCondition(RESTED_SINCE),
  };
}

/** A national team's player from abroad by his match id (`<team>~<row>`), called up or not; null for any other id. */
export function nationalOutsiderOf(state: Pick<GameState, "nations" | "date">, playerId: string): SimPlayer | null {
  const at = playerId.lastIndexOf(OUTSIDER_MARK);
  if (at <= 0) return null;
  return outsiderPlayerOf(state, playerId.slice(0, at), Number(playerId.slice(at + OUTSIDER_MARK.length)));
}

/** A national team as a match reads it: on grass, with no Brazilian state. */
export function nationalClubOf(state: Pick<GameState, "nations">, teamId: string): { id: string; shortName: string; pitch: "natural"; state: null } | null {
  const team = state.nations?.teams[teamId];
  return team ? { id: team.id, shortName: team.name, pitch: "natural", state: null } : null;
}

/** The tactics the human coach of a national team plays it with: his last ones, else his assistant's formation for its squad. */
export function nationalTacticsOf(state: GameState, teamId: string): Tactics {
  const job = humanNationalJobOf(state, teamId);
  if (job?.tactics) return job.tactics;
  return { ...DEFAULT_TACTICS, formation: formationOf(state, teamId, nationalSquadOf(state, teamId)) };
}
