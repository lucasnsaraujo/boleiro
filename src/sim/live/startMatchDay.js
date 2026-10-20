import { simulateMatch } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { CARD_RATES, cardCompetitionOf } from "../discipline/cardRates.js";
import { countCards, drawCards, sendOffMinutes } from "../discipline/drawCards.js";
import { openDisciplineDay } from "../discipline/recordCards.js";
import { refuseSuspended } from "../discipline/suspendedPlayers.js";
import { clubMood } from "../morale/clubMood.js";
import { withoutCrowd } from "../morale/withoutCrowd.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { isInjured } from "../players/isInjured.js";
import { matchSetup, playingStrength } from "../players/matchSetup.js";
import { drawMatchInjuries, recordMatchLoad } from "../players/recordMatchLoad.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { settleShootout } from "../settleShootout.js";
import { coachOutcome } from "./coachOutcome.js";
import { kickOffTimeline, scorerStream } from "./matchTimeline.js";
const LINEUP_SIZE = 11;
// Goal minutes and redraws of the coach's match draw from streams of their own, so the day's
// results stay as the main stream has always drawn them.
const TIMELINE_STREAM_SALT = 0x71e11e;
const COACH_MATCH_STREAM_SALT = 0xc0ac5;
/** Club squads, indexed on first use: most days have no match and need none. */
function squadsOf(state) {
    let squads = null;
    return (clubId) => {
        squads ??= squadsByClub(state.players);
        return squads.get(clubId) ?? [];
    };
}
function coachLineupOf(state, decisions) {
    if (!decisions.lineup || !state.coachClubId)
        return null;
    const lineup = decisions.lineup.map((id) => state.players[id]);
    const chosen = lineup.filter((player) => player?.clubId === state.coachClubId);
    if (chosen.length !== lineup.length)
        throw new Error(`lineup has players who are not at ${state.coachClubId}`);
    const injured = chosen.filter((player) => isInjured(player, state.date));
    if (injured.length)
        throw new Error(`lineup has injured players: ${injured.map((p) => p.name).join(", ")}`);
    if (chosen.length !== LINEUP_SIZE || new Set(chosen).size !== LINEUP_SIZE)
        throw new Error(`lineup needs ${LINEUP_SIZE} different players`);
    if (chosen.filter((player) => player.group === "GK").length !== 1)
        throw new Error("lineup needs exactly one goalkeeper");
    return chosen;
}
/**
 * Kicks off today's matches: every match is drawn as advanceDay always drew it and gets its
 * timeline. The coach's match stays open for applyLiveChange until finishMatchDay; the others are
 * recorded at once.
 */
export function startMatchDay(state, decisions) {
    const random = randomStream(state.rngState);
    const timelineRandom = randomStream(state.rngState ^ TIMELINE_STREAM_SALT).next;
    const events = [];
    const squad = squadsOf(state);
    const coach = { lineup: coachLineupOf(state, decisions), tactics: decisions.tactics ?? state.coach.tactics };
    const playedToday = [];
    const cards = openDisciplineDay(state.discipline);
    const sheets = {};
    const matches = [];
    let coachMatch = null;
    const fixtures = state.fixtures.map((fixture) => {
        if (fixture.date !== state.date || fixture.result)
            return fixture;
        const competition = state.competitions[fixture.competitionId];
        if (!competition)
            throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
        const suspended = cards.suspended(fixture.competitionId);
        const coachClubId = [fixture.homeId, fixture.awayId].find((id) => id === state.coachClubId);
        if (coachClubId)
            refuseSuspended(coach.lineup ?? [], suspended);
        const available = (clubId) => squad(clubId).filter((p) => !suspended.has(p.id));
        const setup = matchSetup(state, fixture, available, coach);
        const cardRates = CARD_RATES[cardCompetitionOf(competition)];
        const bookings = drawCards(setup.homeLineup, setup.awayLineup, cardRates, random.next);
        const params = withoutCrowd(paramsForCompetition(competition), clubMood(state, fixture.homeId));
        const goals = simulateMatch(setup.home, setup.away, random.next, params, sendOffMinutes(bookings, fixture.homeId));
        const score = { ...goals, cards: countCards(bookings, fixture.homeId) };
        const played = settleShootout(state, { ...fixture, result: score }, random.next);
        const injuries = drawMatchInjuries([...setup.homeLineup, ...setup.awayLineup], setup.context, random.next);
        const { homeId, awayId } = fixture;
        const timeline = kickOffTimeline({ homeId, awayId, ...setup, goals, bookings, injuries }, timelineRandom, scorerStream(state.seed, fixture.id));
        matches.push({ fixtureId: fixture.id, homeId, awayId, formations: setup.formations, events: timeline.events });
        const lineups = { home: setup.homeLineup, away: setup.awayLineup };
        if (coachClubId) {
            const kickOff = coachOutcome(state, competition, { played, context: setup.context, awayTravelKm: setup.awayTravelKm, lineups, minutes: new Map(), bookings, injuries, scorers: timeline.scorers }, random.next);
            const coachLineup = coachClubId === homeId ? setup.homeLineup : setup.awayLineup;
            const opponentId = coachClubId === homeId ? awayId : homeId;
            const bench = available(coachClubId).filter((p) => !isInjured(p, state.date) && !coachLineup.includes(p));
            const strengthsOf = (clubId, players) => {
                const strength = playingStrength(state, clubId, setup.context, available(clubId));
                return players.map((p) => [p.id, strength(p)]);
            };
            const opponentLineup = opponentId === homeId ? setup.homeLineup : setup.awayLineup;
            coachMatch = {
                fixtureId: fixture.id,
                context: setup.context,
                awayTravelKm: setup.awayTravelKm,
                params,
                cardRates,
                starters: lineups,
                bench,
                strengths: Object.fromEntries([...strengthsOf(coachClubId, [...coachLineup, ...bench]), ...strengthsOf(opponentId, opponentLineup)]),
                tactics: coach.tactics,
                lastChangeMinute: 0,
                rngState: state.rngState ^ COACH_MATCH_STREAM_SALT,
                kickOff,
                isChanged: false,
                eventsIndex: events.length,
            };
            return fixture;
        }
        events.push({ type: "matchPlayed", fixture: played });
        const load = recordMatchLoad({ ...setup, result: score }, injuries);
        playedToday.push(...load.players);
        events.push(...load.events);
        events.push(...cards.record(competition, played, bookings, (id) => state.players[id]?.clubId, random.next));
        sheets[played.id] = { ...lineups, scorers: timeline.scorers };
        return played;
    });
    return {
        state,
        decisions,
        matches,
        coachMatch,
        rest: { fixtures, events, players: playedToday, discipline: cards.discipline(), sheets, rngState: random.state() },
    };
}
