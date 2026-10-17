import { NO_RECORDS, type ClubRecords, type LeagueRecords, type PlayerAtClub, type SeasonAwards } from "@boleiro/engine/sim/history/history";
import { seasonAwards } from "@boleiro/engine/sim/history/seasonAwards";
import type { GameState } from "@boleiro/engine/sim/gameState";

/** A filed season's awards and its Brasileirão champion. */
export type AwardedSeason = { season: number; awards: SeasonAwards; championId: string | null };

/** The awards screen: the season under way as it stands, the filed seasons newest first, and the records. */
export type AwardsBook = {
  /** The season under way, ranked on its tallies so far; null before its first Série A round. */
  provisional: { season: number; roundsPlayed: number; awards: SeasonAwards } | null;
  seasons: AwardedSeason[];
  league: LeagueRecords | null;
  /** The coach's club's records and its players most capped and most scoring; null without a club. */
  club: { clubId: string; records: ClubRecords; mostApps: (PlayerAtClub & { playerId: string })[]; topScorers: (PlayerAtClub & { playerId: string })[] } | null;
};

// The records page lists the club's five most capped players and its five top scorers.
const LEADERS = 5;

export function awardsBook(state: GameState): AwardsBook {
  const { history } = state;
  const league = Object.values(state.competitions).find((c) => c.kind === "league" && c.division === "A");
  const played = league ? state.fixtures.filter((f) => f.competitionId === league.id && f.result) : [];
  const perRound = league ? Math.floor(league.clubIds.length / 2) : 0;
  const roundsPlayed = perRound ? Math.floor(played.length / perRound) : 0;
  const provisional = roundsPlayed > 0 ? { season: state.season, roundsPlayed, awards: seasonAwards(state, history.current.champions) } : null;
  const seasons = history.seasons
    .flatMap((s) => (s.awards ? [{ season: s.season, awards: s.awards, championId: s.champions["serie-a"] ?? null }] : []))
    .reverse();
  const clubId = state.coachClubId ?? history.coach.stints.at(-1)?.clubId ?? null;
  const players = Object.entries(clubId ? (history.players[clubId] ?? {}) : {}).map(([playerId, p]) => ({ playerId, ...p }));
  const club = clubId && {
    clubId,
    records: { ...NO_RECORDS, ...history.clubs[clubId] },
    mostApps: [...players].sort((a, b) => b.apps - a.apps || b.goals - a.goals).slice(0, LEADERS),
    topScorers: players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.apps - b.apps).slice(0, LEADERS),
  };
  return { provisional, seasons, league: history.leagues?.["serie-a"] ?? null, club: club || null };
}
