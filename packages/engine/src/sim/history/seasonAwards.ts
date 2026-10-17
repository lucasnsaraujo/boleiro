import { GROUP_OF_ROLE, type PositionGroup, type Role } from "@boleiro/data/players";
import type { GameState, SimPlayer } from "../gameState.js";
import { latestChampionsLeagueWinner } from "../continental/uefaCups.js";
import { typicalRating } from "../live/matchRatings.js";
import { competitionKey, type AwardedPlayer, type BallonDorVote, type CompetitionKey, type SeasonAwards, type SeasonMark } from "./history.js";

// The Bola de Prata (Placar 1970–2015, ESPN since 2016) averages the 0–10 marks each player gets per
// Brasileirão match; the best average at each position takes it and the best overall the Bola de Ouro
// (placar.com.br/?p=226). This game's match ratings (matchRatings) stand in for the marks. A player
// needs 19 games, half the rounds (netvasco.com.br/n/265504, 2020 edition); a tie goes to the one with
// more games (bemparana.com.br, "Viveros lidera o prêmio Bola de Ouro", 2026).
const MIN_SHARE_OF_ROUNDS = 0.5;
// The 2025 and 2026 team: the best goalkeeper, two centre-backs and the two full-backs; then a defensive
// midfielder, a midfielder and a forward, and the three best averages of the rest, at most three a
// position (bemparana.com.br, "Seleção Bola da Prata tem dois do Athletico após 18 rodadas", 2026).
// The game's positions don't tell defensive midfielders from the rest, so its midfield takes two first.
const FIXED: readonly [Role, number][] = [["goleiro", 1], ["lateral", 2], ["zagueiro", 2], ["meia", 2], ["atacante", 1]];
const FLEXIBLE = 3;
const MOST_FORWARDS = 3;
const ROLE_ORDER: readonly Role[] = ["goleiro", "lateral", "zagueiro", "meia", "atacante"];
// Match ratings follow FotMob's spread per position, where keepers average 7.11 and forwards 6.67
// (matchRatings), so raw averages would hand every Bola de Ouro to a keeper. guess: the Bola de Ouro,
// the open places of the team and the Ballon d'Or rank players by their average above their position's.
// guess: the Brasileirão's "revelação" is 21 or younger, as France Football's Kopa Trophy is for under-21s.
const YOUNG_AGE = 21;

// France Football judges the Ballon d'Or on individual performances, team performances and titles,
// and class (Wikipedia, "Ballon d'Or", 2022 rules). guess, the whole model: a player's strength (one
// worldwide scale, from EA FC's ratings), plus for full-tier players four points per rating point above
// his position's typical rating over at least 20 games, 0.15 a goal and 0.1 an assist, plus each title his club won this season.
// Result-only clubs have no ratings, so their players get the season the full tier's 20 strongest
// candidates had on average, on top of their strength and titles.
const BALLON_MIN_APPS = 20;
const PER_RATING_POINT = 4;
const PER_GOAL = 0.15;
const PER_ASSIST = 0.1;
const BALLON_PLACES = 3;
const USUAL_SEASON_OF = 20;
// guess: the strongest three of each result-only club are its candidates.
const WORLD_CANDIDATES_PER_CLUB = 3;
const ROLE_OF_GROUP: Record<PositionGroup, Role> = { GK: "goleiro", DEF: "zagueiro", MID: "meia", ATT: "atacante" };

/** What the awards read of the game. */
export type AwardsState = Pick<GameState, "season" | "players" | "clubs" | "competitions" | "history" | "world" | "europe">;

/** The season's awards as they were handed out at its close. */
export type SeasonAwarded = { type: "seasonAwarded"; season: number; awards: SeasonAwards };

/** A player's main position; a player the data gives none plays his group's usual one. */
export function roleOf(player: Pick<SimPlayer, "group" | "positions">): Role {
  const [main] = player.positions ?? [];
  return main && GROUP_OF_ROLE[main] === player.group ? main : ROLE_OF_GROUP[player.group];
}

/** A player's average above the typical one at his position. */
const aboveTypical = (p: AwardedPlayer) => p.average - typicalRating(GROUP_OF_ROLE[p.role]);
const byAverage = (a: AwardedPlayer, b: AwardedPlayer) => aboveTypical(b) - aboveTypical(a) || b.apps - a.apps || a.playerId.localeCompare(b.playerId);

/** The Bola de Prata team, best averages first at each step, in field order. */
function silverTeam(eligible: readonly AwardedPlayer[]): AwardedPlayer[] {
  const picked = new Set<string>();
  const team: AwardedPlayer[] = [];
  const take = (player: AwardedPlayer) => {
    picked.add(player.playerId);
    team.push(player);
  };
  for (const [role, count] of FIXED) eligible.filter((p) => p.role === role).slice(0, count).forEach(take);
  for (const player of eligible) {
    if (team.length >= FIXED.reduce((n, [, c]) => n + c, 0) + FLEXIBLE) break;
    if (picked.has(player.playerId) || (player.role !== "meia" && player.role !== "atacante")) continue;
    if (player.role === "atacante" && team.filter((p) => p.role === "atacante").length >= MOST_FORWARDS) continue;
    take(player);
  }
  return team.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || byAverage(a, b));
}

const TITLE_POINTS: Record<string, number> = { libertadores: 4, "champions-league": 4, "club-world-cup": 2, "copa-do-brasil": 1, "sul-americana": 1, "europa-league": 1, "intercontinental-cup": 1 };
// guess: a top-flight league title is worth two, a lower league's or a super cup half, an estadual 0.3.
const TOP_LEAGUE_TITLE = 2;
const LOWER_TITLE = 0.5;
const STATE_TITLE = 0.3;

function titlePoints(state: AwardsState, key: CompetitionKey): number {
  if (key in TITLE_POINTS) return TITLE_POINTS[key] ?? 0;
  if (key.startsWith("state-")) return STATE_TITLE;
  const competition = Object.values(state.competitions).find((c) => competitionKey(c.id) === key);
  const isTop = competition?.kind === "league" && (competition.division === "A" || competition.abroad?.level === 0);
  return isTop ? TOP_LEAGUE_TITLE : LOWER_TITLE;
}

/** Each club's titles this season, by competition: the game's own and those its result-only countries and UEFA filed. */
function titlesByClub(state: AwardsState, champions: Readonly<Record<CompetitionKey, string>>): Map<string, { keys: CompetitionKey[]; points: number }> {
  const titles = new Map<string, { keys: CompetitionKey[]; points: number }>();
  const add = (clubId: string | undefined, key: CompetitionKey, points: number) => {
    if (!clubId) return;
    const own = titles.get(clubId) ?? { keys: [], points: 0 };
    titles.set(clubId, { keys: [...own.keys, key], points: own.points + points });
  };
  for (const [key, clubId] of Object.entries(champions)) add(clubId, key, titlePoints(state, key));
  for (const [countryId, country] of Object.entries(state.world ?? {})) {
    const last = country.seasons.at(-1);
    if (!last || last.season < state.season - 1) continue;
    add(last.champions[0], `league-${countryId}`, TOP_LEAGUE_TITLE);
    add(last.cup?.championId, `cup-${countryId}`, TITLE_POINTS["copa-do-brasil"] ?? 1);
  }
  // UEFA's season ends mid-year: the one filed last, or before the game played one, the last real champion.
  const uefa = state.europe?.winners.at(-1);
  if (uefa && uefa.season >= state.season - 1) {
    add(uefa.championsLeague, "champions-league", TITLE_POINTS["champions-league"] ?? 0);
    add(uefa.europaLeague, "europa-league", TITLE_POINTS["europa-league"] ?? 0);
  } else if (state.europe) {
    add(latestChampionsLeagueWinner(state.europe) ?? undefined, "champions-league", TITLE_POINTS["champions-league"] ?? 0);
  }
  return titles;
}

/** The world's best three: full-tier players on their season in every competition, result-only stars on strength and titles. */
function ballonDor(state: AwardsState, champions: Readonly<Record<CompetitionKey, string>>): BallonDorVote[] {
  const { ratings = {}, goals } = state.history.current;
  const totals = new Map<string, SeasonMark>();
  for (const tally of Object.values(ratings)) {
    for (const [id, [apps, tenths, assists]] of Object.entries(tally)) {
      const [a, t, s] = totals.get(id) ?? [0, 0, 0];
      totals.set(id, [a + apps, t + tenths, s + assists]);
    }
  }
  const goalsOf = (id: string) => Object.values(goals).reduce((sum, own) => sum + (own[id] ?? 0), 0);
  const titles = titlesByClub(state, champions);
  const votes: BallonDorVote[] = [];
  const seasons: { strength: number; season: number }[] = [];
  for (const [playerId, [apps, tenths, assists]] of totals) {
    const player = state.players[playerId];
    if (!player || apps < BALLON_MIN_APPS) continue;
    const average = tenths / apps / 10;
    const scored = goalsOf(playerId);
    const won = titles.get(player.clubId);
    const season = PER_RATING_POINT * (average - typicalRating(player.group)) + PER_GOAL * scored + PER_ASSIST * assists;
    seasons.push({ strength: player.strength, season });
    const score = player.strength + season + (won?.points ?? 0);
    const clubName = state.clubs[player.clubId]?.shortName ?? player.clubId;
    votes.push({ playerId, name: player.name, clubId: player.clubId, clubName, score, titles: won?.keys ?? [], apps, goals: scored, average: Math.round(average * 100) / 100 });
  }
  const strongest = seasons.sort((a, b) => b.strength - a.strength).slice(0, USUAL_SEASON_OF);
  const usualSeason = strongest.length ? strongest.reduce((sum, s) => sum + s.season, 0) / strongest.length : 0;
  for (const country of Object.values(state.world ?? {})) {
    if (country.isFullTier) continue;
    for (const club of Object.values(country.clubs)) {
      if (!club.names) continue;
      const won = titles.get(club.id);
      const strongest = club.strengths.map((strength, index) => ({ strength, index })).sort((a, b) => b.strength - a.strength || a.index - b.index).slice(0, WORLD_CANDIDATES_PER_CLUB);
      for (const { strength, index } of strongest) {
        const name = club.names[index];
        if (!name) continue;
        votes.push({ playerId: `${club.id}:${index}`, name, clubId: club.id, clubName: club.name, score: strength + usualSeason + (won?.points ?? 0), titles: won?.keys ?? [], apps: null, goals: null, average: null });
      }
    }
  }
  return votes
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))
    .slice(0, BALLON_PLACES)
    .map((vote) => ({ ...vote, score: Math.round(vote.score * 10) / 10 }));
}

/**
 * The season's awards from its tallies, filed as the season closes: the Brasileirão's Bola de Ouro, Bola
 * de Prata team, top scorer and best young player, and the world's Ballon d'Or. `champions` are the
 * season's champions by competition.
 */
export function seasonAwards(state: AwardsState, champions: Readonly<Record<CompetitionKey, string>>): SeasonAwards {
  const league = Object.values(state.competitions).find((c) => c.kind === "league" && c.division === "A");
  const key = league ? competitionKey(league.id) : "serie-a";
  const rounds = league && league.kind === "league" ? (league.clubIds.length - 1) * (league.legs ?? 2) : 0;
  const tally = state.history.current.ratings?.[key] ?? {};
  const goals = state.history.current.goals[key] ?? {};
  const awarded = (playerId: string, [apps, tenths, assists]: SeasonMark): AwardedPlayer | null => {
    const player = state.players[playerId];
    if (!player || apps === 0) return null;
    return { playerId, name: player.name, clubId: player.clubId, role: roleOf(player), age: player.age, apps, goals: goals[playerId] ?? 0, assists, average: Math.round((tenths / apps) * 10) / 100 };
  };
  const eligible = Object.entries(tally)
    .flatMap(([id, mark]) => (mark[0] >= MIN_SHARE_OF_ROUNDS * rounds ? [awarded(id, mark)] : []))
    .filter((p): p is AwardedPlayer => p !== null)
    .sort(byAverage);
  const [first = null, ...rest] = eligible;
  // As the history's top scorers: most goals, then the player id.
  const [scorerId, scorerGoals = 0] = Object.entries(goals).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0] ?? [];
  const topScorer = scorerId && scorerGoals > 0 ? awarded(scorerId, tally[scorerId] ?? [0, 0, 0]) ?? null : null;
  return {
    competition: key,
    bolaDeOuro: first,
    runnersUp: rest.slice(0, 2),
    bolaDePrata: silverTeam(eligible),
    topScorer,
    bestYoung: eligible.find((p) => p.age <= YOUNG_AGE) ?? null,
    ballonDor: ballonDor(state, champions),
  };
}
