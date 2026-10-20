import { FORMATION } from "../../engine/match.js";
import { effectiveStrength } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";
import { isInjured } from "./isInjured.js";
// guess: on top of what fatigue costs today, an AI coach values keeping a player fresh at this
// many strength points per full match of fatigue. A starter who played three days earlier
// (about 25 fatigue) then gives way to a fit backup up to 2.5 points weaker: rotation in
// congested weeks, while a week's rest leaves the best eleven alone.
const ROTATION_COST = 6;
const GROUPS = ["GK", "DEF", "MID", "ATT"];
/**
 * The AI coach's starting eleven: the engine's 4-4-2, or the `shape` asked for, filled by fit
 * players in order of the strength they would play at today, less a cost for fatigue they carry.
 * Injured players never start. A squad short in one position borrows the best remaining players
 * from the others.
 */
export function pickMatchLineup(squad, context, shape = FORMATION) {
    const score = (p) => effectiveStrength(p, context) - (ROTATION_COST * fatigueOn(p, context.date)) / 100;
    const ranked = squad
        .filter((p) => !isInjured(p, context.date))
        .map((player) => ({ player, score: score(player) }))
        .sort((a, b) => b.score - a.score)
        .map(({ player }) => player);
    const lineup = GROUPS.flatMap((group) => ranked.filter((p) => p.group === group).slice(0, shape[group]));
    const chosen = new Set(lineup);
    return [...lineup, ...ranked.filter((p) => !chosen.has(p)).slice(0, 11 - lineup.length)];
}
