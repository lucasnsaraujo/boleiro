import clubs from "../../../../data/clubs.csv?raw";
import competitionMoney from "../../../../data/competition-money.json?raw";
import finances from "../../../../data/finances.csv?raw";
import players from "../../../../data/players.csv?raw";
import type { GameFiles } from "@boleiro/engine/sim/loadNewGame";

export const bundledGameFiles: GameFiles = { clubs, players, finances, competitionMoney };
