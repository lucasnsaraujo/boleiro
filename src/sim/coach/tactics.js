export const DEFAULT_TACTICS = { formation: "4-4-2", posture: "balanced", penaltyTakerId: null };
// guess: an AI coach plays balanced until the last half hour, then chases a game it is losing and
// sits on a lead in the last quarter of an hour.
const CHASE_FROM_MINUTE = 60;
const PROTECT_FROM_MINUTE = 75;
/** The AI coach's posture at this minute, given his side's goal difference. */
export function aiPosture(goalDifference, minute) {
    if (goalDifference < 0 && minute >= CHASE_FROM_MINUTE)
        return "attacking";
    if (goalDifference > 0 && minute >= PROTECT_FROM_MINUTE)
        return "defensive";
    return "balanced";
}
