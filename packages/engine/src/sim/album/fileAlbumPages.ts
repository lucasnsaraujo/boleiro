import type { Role } from "@boleiro/data/players";
import type { WaitingCoach } from "../coach/humanCoaches.js";
import type { GameState } from "../gameState.js";
import { IDOL_APPS, IDOL_GOALS } from "../history/clubHistory.js";
import type { CoachRecord, SeasonRecord } from "../history/history.js";
import { roleOf } from "../history/seasonAwards.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { SHINE, type AlbumPage, type AlbumSticker, type SquadMark } from "./album.js";
import { compareText } from "../compareText.js";

// guess: a club's top scorer earns his shine with five goals; fewer make him the best of a dry season, not a scorer.
const CLUB_TOP_SCORER_GOALS = 5;
const ROLE_ORDER: readonly Role[] = ["goleiro", "lateral", "zagueiro", "meia", "atacante"];

/** The players the season's awards picked, and its top scorers, by id. */
function honoured(record: SeasonRecord): { awarded: Set<string>; topScorers: Set<string> } {
  const { awards } = record;
  const awarded = awards ? [awards.bolaDeOuro, ...awards.bolaDePrata, awards.topScorer, awards.bestYoung, awards.ballonDor[0]] : [];
  return {
    awarded: new Set(awarded.flatMap((player) => (player ? [player.playerId] : []))),
    topScorers: new Set(Object.values(record.topScorers).map((scorer) => scorer.playerId)),
  };
}

/** The clubs a coach ran during `season`, in the order he ran them. */
function clubsOf(record: CoachRecord, season: number): string[] {
  const ran = record.stints.filter((stint) => stint.from <= `${season}-12-31` && (stint.until === null || stint.until >= `${season}-01-01`));
  return [...new Set(ran.map((stint) => stint.clubId))];
}

function pageOf(state: GameState, record: SeasonRecord, clubId: string, isRunning: boolean): AlbumPage {
  const { history } = state;
  const counted: Record<string, SquadMark> = history.current.squads?.[clubId] ?? {};
  const marks = new Map(Object.entries(counted));
  // The club he still runs prints its whole squad, those who never played included.
  if (isRunning) for (const player of squadsOfGame(state).get(clubId) ?? []) if (!marks.has(player.id)) marks.set(player.id, [0, 0, roleOf(player)]);
  const atClub = history.players[clubId] ?? {};
  const { awarded, topScorers } = honoured(record);
  const clubBest = Math.max(0, ...[...marks.values()].map(([, goals]) => goals));
  const stickers = [...marks].map(([id, [apps, goals, role]]): AlbumSticker => {
    const total = atClub[id];
    const isIdol = !!total && (total.apps >= IDOL_APPS || total.goals >= IDOL_GOALS);
    const isTopScorer = topScorers.has(id) || (goals === clubBest && goals >= CLUB_TOP_SCORER_GOALS);
    const shine = (isIdol ? SHINE.idol : 0) | (isTopScorer ? SHINE.topScorer : 0) | (awarded.has(id) ? SHINE.award : 0);
    return [id, state.players[id]?.name ?? total?.name ?? id, role, apps, goals, shine];
  });
  stickers.sort((a, b) => ROLE_ORDER.indexOf(a[2]) - ROLE_ORDER.indexOf(b[2]) || b[3] - a[3] || b[4] - a[4] || compareText(a[1], b[1]));
  const { squadsSince } = history.current;
  // A count that began after the season did leaves out the games the club played before it.
  const isPartial = !!squadsSince && state.fixtures.some((f) => f.result && f.date < squadsSince && (f.homeId === clubId || f.awayId === clubId));
  return { season: record.season, clubId, stickers, ...(isPartial ? { since: squadsSince } : {}) };
}

function withPages(state: GameState, record: SeasonRecord, coach: CoachRecord, runningClubId: string | null): CoachRecord {
  // A save from before the album that played none of its matches after loading has nothing to print: its season stays unprinted.
  if (!state.history.current.squads) return coach;
  const pages = clubsOf(coach, record.season).map((clubId) => pageOf(state, record, clubId, clubId === runningClubId));
  return pages.length ? { ...coach, album: [...(coach.album ?? []), ...pages] } : coach;
}

/**
 * Prints the season's pages in every human coach's album, before the season's counts go: one per club
 * he ran during the season, with every player who played for it while a human coach ran it (the club he
 * still runs adds the rest of its squad), each sticker shining for an idol of the club, a top scorer or
 * an award winner of `record`, the season just filed.
 */
export function fileAlbumPages(state: GameState, record: SeasonRecord): { coach: CoachRecord; waitingCoaches?: WaitingCoach[] } {
  const coach = withPages(state, record, state.history.coach, state.coachClubId);
  if (!state.waitingCoaches) return { coach };
  return { coach, waitingCoaches: state.waitingCoaches.map((waiting) => ({ ...waiting, record: withPages(state, record, waiting.record, waiting.clubId) })) };
}
