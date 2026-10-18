import type { NationalFootball } from "@boleiro/data/nationalFootball";
import { randomStream } from "../../engine/random.js";
import type { SimPlayer } from "../gameState.js";
import { strengthFromValue } from "../world/strengthYardstick.js";
import { nationalsByTeam } from "./callUps.js";
import { competitionsOf } from "./nationalCompetitions.js";
import { ROLE_LETTERS, type Nations, type NationalTeam, type Outsiders } from "./nations.js";

// National football draws from a stream of its own, so the clubs' matches and money stay as the seed always gave them.
const NATIONS_STREAM_SALT = 0x5e1ec;

/** Each team's pool players the game has no squad place for: the pack's last real squad less the game's own players of the same name and citizenship. */
function outsidersOf(football: NationalFootball, nationals: ReadonlyMap<string, readonly SimPlayer[]>): Record<string, Outsiders> {
  const pools: Record<string, Outsiders> = {};
  for (const team of football.teams) {
    const inGame = new Set((nationals.get(team.id) ?? []).map((p) => p.name));
    const squad = football.squads.filter((p) => p.teamId === team.id && !inGame.has(p.name));
    const listed = squad.flatMap((p) => (p.marketValueEur ? [p.marketValueEur] : []));
    const lowest = listed.length ? Math.min(...listed) : 0;
    pools[team.id] = {
      names: squad.map((p) => p.name),
      roles: squad.map((p) => ROLE_LETTERS[p.role]).join(""),
      strengths: squad.map((p) => strengthFromValue(p.marketValueEur ?? lowest)),
      born: squad.map((p) => Number(p.birthDate?.slice(0, 4) ?? 0)),
      clubs: squad.map((p) => p.clubName),
      clubIds: squad.map((p) => (p.clubTransfermarktId ? `tm-${p.clubTransfermarktId}` : "")),
    };
  }
  return pools;
}

/**
 * National football as a career opens it on 1 January of `season`: the pack's teams on their FIFA points, each
 * pool's outsiders, and the season's competitions drawn (2026's World Cup and Nations League as they really were).
 * guess: the ranking the pack carries (7 Oct 2026) stands in for the one of the day the career starts.
 */
export function openNations(football: NationalFootball, players: Readonly<Record<string, SimPlayer>>, season: number, seed: number): Nations {
  const points = new Map(football.ranking.rows.map((row) => [row.teamId, row.points]));
  const lowest = Math.min(...football.ranking.rows.map((row) => row.points));
  const teams: Record<string, NationalTeam> = Object.fromEntries(
    football.teams.map((team) => [team.id, { id: team.id, name: team.name, confederation: team.confederation, code: team.code, colours: team.colours, points: points.get(team.id) ?? lowest }]),
  );
  const random = randomStream((seed ^ NATIONS_STREAM_SALT) >>> 0);
  const opened = competitionsOf(season, { teams, competitions: {}, matches: [] }, random.next, season === 2026 ? football.fixtures : []);
  return {
    teams,
    outsiders: outsidersOf(football, nationalsByTeam(players, teams)),
    ranked: football.ranking.rows.filter((row) => !(row.teamId in teams)).map((row) => ({ name: row.name, points: row.points })),
    rankingSource: { date: football.ranking.date, source: football.ranking.source },
    competitions: Object.fromEntries(opened.competitions.map((c) => [c.id, c])),
    matches: opened.matches,
    callUps: {},
    duty: {},
    titles: [],
    rngState: random.state(),
  };
}
