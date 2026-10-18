import { GROUP_OF_ROLE } from "@boleiro/data/players";
import { DEFAULT_TACTICS, type Tactics } from "../coach/tactics.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { formationOf } from "../players/usualLineups.js";
import { OUTSIDER_MARK, ROLE_OF_LETTER, splitRefs } from "./callUps.js";
import { callUpRefsOf } from "./nationalJobs.js";

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
  const pool = nations.outsiders[teamId];
  const year = Number(state.date.slice(0, 4));
  const others = callUp.outsiders.flatMap((row): SimPlayer[] => {
    const name = pool?.names[row];
    if (name === undefined) return [];
    const role = ROLE_OF_LETTER[pool?.roles[row] ?? "m"] ?? "meia";
    const born = pool?.born[row] ?? 0;
    return [
      {
        id: `${teamId}${OUTSIDER_MARK}${row}`,
        clubId: teamId,
        name,
        group: GROUP_OF_ROLE[role],
        positions: [role],
        strength: pool?.strengths[row] ?? 0,
        wage: 0,
        contractUntil: NEVER,
        age: born ? year - born : UNKNOWN_AGE,
        nationalities: [],
        trait: null,
        condition: freshCondition(RESTED_SINCE),
      },
    ];
  });
  const squad = [...own, ...others];
  byTeam.set(teamId, squad);
  return squad;
}

/** A national team as a match reads it: on grass, with no Brazilian state. */
export function nationalClubOf(state: Pick<GameState, "nations">, teamId: string): { id: string; shortName: string; pitch: "natural"; state: null } | null {
  const team = state.nations?.teams[teamId];
  return team ? { id: team.id, shortName: team.name, pitch: "natural", state: null } : null;
}

/** The tactics the human coach of a national team plays it with: his last ones, else his assistant's formation for its squad. */
export function nationalTacticsOf(state: GameState, teamId: string): Tactics {
  const job = state.nations?.job;
  if (job?.teamId === teamId && job.tactics) return job.tactics;
  return { ...DEFAULT_TACTICS, formation: formationOf(state, teamId, nationalSquadOf(state, teamId)) };
}
