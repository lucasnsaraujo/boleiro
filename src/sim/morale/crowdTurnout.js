// guess: the happiest fans fill 10% more seats than neutral ones, the angriest 10% fewer.
const TURNOUT_SWING = 0.1;
/** Share of the usual crowd that comes to a home game: none behind closed doors, else by fan mood. */
export function crowdTurnout(mood) {
    if (mood.closedDoorGames > 0)
        return 0;
    return 1 + (TURNOUT_SWING * (mood.fans - 50)) / 50;
}
