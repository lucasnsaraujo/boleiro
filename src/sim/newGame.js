import { randomStream } from "../engine/random.js";
import { openingCoach } from "./coach/openingCoach.js";
import { newHistory } from "./history/history.js";
import { recordStrengths } from "./history/recordStrengths.js";
import { NEUTRAL_MOOD } from "./morale/clubMood.js";
import { openingFinances } from "./finances/openingFinances.js";
import { academyPlayer, groupsToFill } from "./players/developPlayers.js";
import { openingProfile } from "./players/openingProfile.js";
import { tierOf } from "./finances/tierOf.js";
import { openingContractUntil } from "./transfers/openingContractUntil.js";
import { openingMarket } from "./transfers/openingMarket.js";
import { startSeason } from "./startSeason.js";
const FIRST_SEASON = 2026;
// Traits draw from their own stream so they don't reshuffle the fixtures a seed has always given.
const TRAIT_STREAM_SALT = 0x7a175;
const COACH_STREAM_SALT = 0xc0ac4;
const CONTRACT_STREAM_SALT = 0xc0417;
// guess: with no earlier estaduais played, the first season seeds them and fills the Copa do Brasil
// from the national ranking stand-in (division, then fanbase).
const FIRST_QUALIFICATION = { statePlacings: {}, phase3Ids: [] };
const ACADEMY_STREAM_SALT = 0xacade;
/**
 * The data lists only part of some small clubs' squads (one has two players), so each club below
 * 18 promotes academy teenagers, as developPlayers does every season. Their wages come out of the
 * club's wage bill with everyone else's.
 */
function academyTopUp(clubs, players, date, random) {
    const squads = new Map();
    for (const p of players)
        squads.set(p.clubId, [...(squads.get(p.clubId) ?? []), p]);
    return clubs.flatMap((club) => groupsToFill(squads.get(club.id) ?? [], []).map((group, i) => academyPlayer(`a${date.slice(0, 4)}-${club.id}-${i}`, club.id, club.division, group, date, random)));
}
// guess: every opening board spends exactly its wage cap, so a new coach could sign nobody in
// January; his board gives him a tenth of room for the first window. July's budget resets it.
const NEW_COACH_WAGE_ROOM = 1.1;
function withNewCoachRoom(finances, coachClubId) {
    const finance = coachClubId === null ? undefined : finances[coachClubId];
    if (coachClubId === null || !finance)
        return finances;
    return { ...finances, [coachClubId]: { ...finance, wageCap: Math.round(NEW_COACH_WAGE_ROOM * finance.wageCap) } };
}
export function newGame(seed, { clubs, players, finances: financeData, competitionMoney, coachClubId, careerMode = false, season = FIRST_SEASON }) {
    const random = randomStream(seed);
    const traitRandom = randomStream(seed ^ TRAIT_STREAM_SALT);
    const contractRandom = randomStream(seed ^ CONTRACT_STREAM_SALT);
    const clubsById = Object.fromEntries(clubs.map((club) => [club.id, club]));
    const dataPlayers = players
        .filter((player) => clubsById[player.clubId])
        .map((player, index) => {
        const { clubId, name, group, strength } = player;
        const tier = tierOf(clubsById[clubId] ?? { division: null });
        const contractUntil = openingContractUntil(tier, season, contractRandom.next);
        return { id: `p${index}`, clubId, name, group, strength, contractUntil, ...openingProfile(player, `${season}-01-01`, traitRandom.next) };
    });
    const squadPlayers = [...dataPlayers, ...academyTopUp(clubs, dataPlayers, `${season}-01-01`, randomStream(seed ^ ACADEMY_STREAM_SALT).next)];
    const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next, FIRST_QUALIFICATION);
    const { economy, finances: boardFinances, wages } = openingFinances(clubsById, squadPlayers, competitions, fixtures, financeData, competitionMoney);
    const finances = withNewCoachRoom(boardFinances, coachClubId);
    const simPlayers = Object.fromEntries(squadPlayers.map((player) => [player.id, { ...player, wage: wages[player.id] ?? 0 }]));
    const market = openingMarket(seed);
    return openingCoach({
        version: 4,
        seed,
        rngState: random.state(),
        date: `${season}-01-01`,
        season,
        coachClubId,
        clubs: clubsById,
        players: simPlayers,
        calendar,
        competitions,
        fixtures,
        economy,
        finances,
        mood: Object.fromEntries(clubs.map((club) => [club.id, NEUTRAL_MOOD])),
        discipline: {},
        history: recordStrengths({ season, players: simPlayers, market, history: newHistory(season, `${season}-01-01`, careerMode ? null : coachClubId) }),
        market,
    }, careerMode, randomStream(seed ^ COACH_STREAM_SALT).next);
}
