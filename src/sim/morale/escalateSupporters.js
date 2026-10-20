// guess: fan mood (0–100, 50 neutral) at which the organised supporters start each step, and
// where they stand down. With the swings in reactToDay a club is under pressure after about
// four defeats in a row and protests after five or six.
const PRESSURE_BELOW = 35;
const PROTEST_BELOW = 25;
const VIOLENCE_BELOW = 20;
const CALM_FROM = 45;
// guess: squad morale lost to a protest at the training ground.
const PROTEST_MORALE_COST = 8;
// guess: chance that a defeat while protests go on ends in disorder the sports court punishes.
const VIOLENCE_CHANCE = 0.12;
// The CBJD art. 213 punishes disorder, pitch invasion or thrown objects with a fine of R$100 to
// R$100,000, or for serious cases the loss of one to ten home games, one or the other
// (Código Brasileiro de Justiça Desportiva; Migalhas, "A crônica de uma violência anunciada").
const FINE = { min: 100, max: 100_000 };
const MAX_CLOSED_GAMES = 10;
// guess: a third of punished incidents are serious enough to cost home games, and courts give
// one to three of the ten allowed (Cruzeiro lost three home games in 2019).
const CLOSED_DOORS_SHARE = 1 / 3;
const TYPICAL_CLOSED_GAMES = 3;
/**
 * Moves a club's organised supporters at most one step after a day that changed its mood. Disorder
 * only follows a defeat. Returns the fine the club owes, if any.
 */
export function escalateSupporters(clubId, mood, lostToday, random) {
    const { fans, supporters } = mood;
    if (fans >= CALM_FROM)
        return { mood: { ...mood, supporters: "calm" }, events: [], fine: 0 };
    if (supporters === "calm" && fans < PRESSURE_BELOW) {
        return { mood: { ...mood, supporters: "pressure" }, events: [{ type: "fansPressure", clubId, fans }], fine: 0 };
    }
    if (supporters === "pressure" && fans < PROTEST_BELOW) {
        const squad = Math.max(0, mood.squad - PROTEST_MORALE_COST);
        return {
            mood: { ...mood, supporters: "protest", squad },
            events: [{ type: "fansProtest", clubId, fans, moraleLost: mood.squad - squad }],
            fine: 0,
        };
    }
    const isProtesting = supporters === "protest" || supporters === "violence";
    if (!isProtesting || !lostToday || fans >= VIOLENCE_BELOW || random() >= VIOLENCE_CHANCE)
        return { mood, events: [], fine: 0 };
    if (random() < CLOSED_DOORS_SHARE) {
        const games = Math.min(MAX_CLOSED_GAMES, 1 + Math.floor(random() * TYPICAL_CLOSED_GAMES));
        return {
            mood: { ...mood, supporters: "violence", closedDoorGames: mood.closedDoorGames + games },
            events: [{ type: "fansViolence", clubId, fine: 0 }, { type: "closedDoors", clubId, games }],
            fine: 0,
        };
    }
    const fine = Math.round(FINE.min + random() * (FINE.max - FINE.min));
    return { mood: { ...mood, supporters: "violence" }, events: [{ type: "fansViolence", clubId, fine }], fine };
}
