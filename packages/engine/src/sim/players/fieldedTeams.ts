import type { Division } from "@boleiro/data/players";
import type { Team } from "../../engine/match.js";
import { DEFAULT_TACTICS } from "../coach/tactics.js";
import type { GameState } from "../gameState.js";
import { engineTeam } from "./matchSetup.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { squadsByClub } from "./squadsByClub.js";
import { formationOf, usualStartersOf } from "./usualLineups.js";

/**
 * Each club of a division as its AI coach fields it on a game's first day: its usual eleven in its
 * formation, placed by position, at the players' plain strength. What calibration plays.
 */
export function fieldedTeams(state: GameState, division: Division): Team[] {
  const squads = squadsByClub(state.players);
  const context = { date: state.date, pitch: "natural" as const };
  return Object.values(state.clubs)
    .filter((club) => club.division === division)
    .map((club) => {
      const squad = squads.get(club.id) ?? [];
      const formation = formationOf(state, club.id, squad);
      const eleven = pickMatchLineup(squad, context, formation, usualStartersOf(state, club.id));
      return engineTeam(club.shortName, eleven, (p) => p.strength, { ...DEFAULT_TACTICS, formation });
    });
}
