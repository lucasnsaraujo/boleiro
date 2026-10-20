export const NO_RECORDS = { biggestWin: null, biggestLoss: null, biggestCrowd: null, recordSale: null, recordSigning: null };
export const competitionKey = (competitionId) => competitionId.replace(/-\d+$/, "");
export function newHistory(season, date, coachClubId) {
    return {
        seasons: [],
        current: { season, champions: {}, goals: {} },
        clubs: {},
        players: {},
        strength: {},
        coach: { stints: coachClubId ? [{ clubId: coachClubId, from: date, until: null, left: null }] : [], trophies: [], firings: [], seasons: [] },
    };
}
