import { loadClubs, parseClubs } from "../data/clubs.js";
import { loadCompetitionMoney, parseCompetitionMoney } from "../data/competition-money.js";
import { loadFinances, parseFinances } from "../data/finances.js";
import { loadPlayers, parsePlayers } from "../data/players.js";
import { newGame } from "./newGame.js";
export function loadNewGame(seed, options) {
    return newGame(seed, {
        ...options,
        clubs: loadClubs(),
        players: loadPlayers(),
        finances: loadFinances(),
        competitionMoney: loadCompetitionMoney(),
    });
}
/** Same game as `loadNewGame`, from file contents the caller already has, as in a browser bundle. */
export function newGameFromFiles(seed, options, files) {
    return newGame(seed, {
        ...options,
        clubs: parseClubs(files.clubs),
        players: parsePlayers(files.players),
        finances: parseFinances(files.finances),
        competitionMoney: parseCompetitionMoney(files.competitionMoney),
    });
}
