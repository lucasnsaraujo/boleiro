const SAVE_VERSION = 4;
const REQUIRED_KEYS = [
    "seed", "rngState", "date", "season", "coachClubId", "clubs", "players", "calendar", "competitions", "fixtures",
    "economy", "finances", "mood", "coach", "boards", "discipline", "history", "market",
];
function isGameState(value) {
    return (typeof value === "object" &&
        value !== null &&
        "version" in value &&
        value.version === SAVE_VERSION &&
        REQUIRED_KEYS.every((key) => key in value));
}
export function saveGame(state) {
    return JSON.stringify(state);
}
/** A parsed save checked as a game of this version; throws otherwise. */
export function toGameState(parsed) {
    if (!isGameState(parsed))
        throw new Error(`not a version ${SAVE_VERSION} Boleiro save`);
    return parsed;
}
export function loadGame(json) {
    return toGameState(JSON.parse(json));
}
