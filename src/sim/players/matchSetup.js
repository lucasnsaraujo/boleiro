import { FORMATIONS, fittingFormation, inFormation } from "../../engine/formations.js";
import { clubMood } from "../morale/clubMood.js";
import { moraleStrength } from "../morale/moraleStrength.js";
import { effectiveStrength } from "./effectiveStrength.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { travelKm } from "./travelKm.js";
/** The strength each player of a club plays at in this match: effective strength plus morale. */
export function playingStrength(state, clubId, context, squad) {
    const morale = clubMood(state, clubId).squad;
    const mostMinutes = Math.max(0, ...squad.map((p) => p.condition.seasonMinutes));
    return (p) => Math.max(1, effectiveStrength(p, context) + moraleStrength(p, morale, mostMinutes, context.date));
}
/** An eleven as the engine sees it; with tactics, in the coach's formation, posture and penalty taker. */
export function engineTeam(name, lineup, strength, tactics) {
    const players = lineup.map((p) => ({ name: p.name, group: p.group, strength: strength(p) }));
    if (!tactics)
        return { name, players };
    const taker = players[lineup.findIndex((p) => p.id === tactics.penaltyTakerId)];
    return { name, players: inFormation(players, tactics.formation), posture: tactics.posture, ...(taker ? { penaltyTaker: taker } : {}) };
}
/**
 * Both elevens for a fixture played today on the home club's pitch. AI clubs pick with
 * pickMatchLineup; the coach's club plays the coach's eleven, or the AI's pick in his formation.
 */
export function matchSetup(state, fixture, squadOf, coach) {
    const homeClub = state.clubs[fixture.homeId];
    const awayClub = state.clubs[fixture.awayId];
    if (!homeClub || !awayClub)
        throw new Error(`fixture ${fixture.id} has an unknown club`);
    const context = { date: fixture.date, pitch: homeClub.pitch };
    const isCoach = (clubId) => clubId === state.coachClubId;
    const lineupOf = (clubId) => {
        if (!isCoach(clubId))
            return pickMatchLineup(squadOf(clubId), context);
        return coach.lineup ? [...coach.lineup] : pickMatchLineup(squadOf(clubId), context, FORMATIONS[coach.tactics.formation]);
    };
    const team = (clubId, name, lineup) => engineTeam(name, lineup, playingStrength(state, clubId, context, squadOf(clubId)), isCoach(clubId) ? coach.tactics : undefined);
    const formationOf = (clubId, lineup) => (isCoach(clubId) ? coach.tactics.formation : fittingFormation(lineup));
    const homeLineup = lineupOf(homeClub.id);
    const awayLineup = lineupOf(awayClub.id);
    return {
        context,
        homeLineup,
        awayLineup,
        awayTravelKm: travelKm(awayClub.state, homeClub.state),
        home: team(homeClub.id, homeClub.shortName, homeLineup),
        away: team(awayClub.id, awayClub.shortName, awayLineup),
        formations: { home: formationOf(homeClub.id, homeLineup), away: formationOf(awayClub.id, awayLineup) },
    };
}
