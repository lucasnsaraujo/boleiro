import type { Fixture, GameState } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import { usualStartersOf } from "../players/usualLineups.js";
import { chemistryOf, SETTLED_LIMIT, type ClubChemistry } from "./chemistryOf.js";

const ELEVEN = 11;
// guess: keeping this many starters from one match to the next leaves `settled` where it is; each
// starter more or fewer moves it a point.
const NEUTRAL_KEPT = 8;
// guess: a match with at least this many of the last match's starters keeps a run of steady games going.
const STEADY_KEPT = 9;

/**
 * Writes each club's starting eleven of today's matches into its chemistry: how many starters it
 * kept from its last match (its usual eleven before its first), which settles the eleven or
 * unsettles it, and the meter at kick-off, read from `kickOff`, the game as the day's matches started.
 * Continental guests keep none.
 */
export function recordElevens(state: GameState, played: readonly Fixture[], sheets: MatchSheets, kickOff: GameState): GameState {
  const sides = played.flatMap((fixture) => {
    const sheet = sheets[fixture.id];
    if (!fixture.result || !sheet) return [];
    return [
      { clubId: fixture.homeId, eleven: sheet.home.slice(0, ELEVEN).map((p) => p.id) },
      { clubId: fixture.awayId, eleven: sheet.away.slice(0, ELEVEN).map((p) => p.id) },
    ].filter((side) => side.clubId in state.clubs);
  });
  if (!sides.length) return state;
  const chemistry = { ...state.chemistry };
  for (const { clubId, eleven } of sides) {
    const before = chemistry[clubId];
    const last = before?.eleven.length ? new Set(before.eleven) : usualStartersOf(state, clubId);
    const kept = last.size ? eleven.filter((id) => last.has(id)).length : NEUTRAL_KEPT;
    const settled = Math.min(SETTLED_LIMIT, Math.max(-SETTLED_LIMIT, (before?.settled ?? 0) + kept - NEUTRAL_KEPT));
    const was = chemistryOf(kickOff, clubId).value;
    const record: ClubChemistry = { eleven, settled, steadyGames: kept >= STEADY_KEPT ? (before?.steadyGames ?? 0) + 1 : 0, kept, was };
    // A named captain who left the club gives the armband back to the assistant's pick.
    const captainId = before?.captainId;
    chemistry[clubId] = captainId !== undefined && state.players[captainId]?.clubId === clubId ? { ...record, captainId } : record;
  }
  return { ...state, chemistry };
}
