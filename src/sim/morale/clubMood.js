/** How far a club's organised supporters (torcida organizada) have escalated, calmest first. */
export const SUPPORTER_STEPS = ["calm", "pressure", "protest", "violence"];
export const NEUTRAL_MOOD = { squad: 50, fans: 50, supporters: "calm", closedDoorGames: 0 };
/** A club's mood as the board, the coach career and the UI read it. */
export function clubMood(state, clubId) {
    return state.mood[clubId] ?? NEUTRAL_MOOD;
}
