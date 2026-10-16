import type { PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { whoPlayed } from "./aiSubstitutions.js";
import { playerStatsAt, type MatchPlay, type PlayerStats } from "./matchPlay.js";
import { FULL_TIME, type MatchEvent } from "./matchTimeline.js";

/** A side as rated after the match: who started and who could come on. */
export type RatedSide = { clubId: string; starters: readonly SimPlayer[]; bench: readonly SimPlayer[] };
export type PlayerRating = { playerId: string; rating: number };

// guess: what each thing a player does is worth, in the spirit of FotMob's ratings: goals and
// assists most, then saves, tackles, shots on target and passes; misses, misplaced passes, fouls,
// cards, own goals and missed penalties cost, and the defence answers for the goals let in. The
// side's result counts in proportion to the minutes he played.
const RESULT = 0.5;
const GOAL = 1;
const PENALTY_GOAL = 0.7;
const ASSIST = 0.6;
const OWN_GOAL = -0.8;
const SHOT_SAVED = 0.15;
const SHOT_MISSED = -0.05;
const PASS = 0.012;
const MISPLACED_PASS = -0.05;
const TACKLE = 0.15;
const FOUL = -0.1;
const YELLOW = -0.3;
const RED = -1.2;
const PENALTY_MISSED = -0.6;
const SAVE = 0.3;
const PENALTY_SAVED = 0.6;
const CONCEDED: Record<PositionGroup, number> = { GK: -0.3, DEF: -0.15, MID: -0.05, ATT: 0 };
const CLEAN_SHEET: Record<PositionGroup, number> = { GK: 0.5, DEF: 0.3, MID: 0, ATT: 0 };
const CLEAN_SHEET_MINUTES = 60;

// The single-match ratings FotMob gave Série A players in their clubs' last league match before
// 2026-10-15 (data/fotmob_cache, the 18 Série A clubs' lastLineupStats whose last match was a
// league one): 267 ratings, by usual position.
const FOTMOB: Record<PositionGroup, { mean: number; sd: number }> = {
  GK: { mean: 7.11, sd: 1.02 },
  DEF: { mean: 6.77, sd: 0.77 },
  MID: { mean: 6.96, sd: 0.69 },
  ATT: { mean: 6.67, sd: 0.74 },
};
// The mean and spread of the scores above over the full-tier matches of a simulated 2026 season
// (seed 1); each position's scores are stretched onto FotMob's.
const SCORES: Record<PositionGroup, { mean: number; sd: number }> = {
  GK: { mean: 0.33, sd: 1.02 },
  DEF: { mean: 0.13, sd: 0.66 },
  MID: { mean: 0.14, sd: 0.66 },
  ATT: { mean: 0.13, sd: 0.73 },
};
const LOWEST = 3;
const HIGHEST = 10;

function scoreOf(s: PlayerStats, margin: number, isCleanSheet: boolean): number {
  // Missed penalties cost their own price, so they leave the taker's other shots.
  const missed = s.shots - s.shotsOnTarget - (s.penaltiesMissed - s.penaltiesKeptOut);
  const saved = s.shotsOnTarget - s.goals - s.penaltiesKeptOut;
  return (
    (RESULT * margin * s.minutes) / FULL_TIME +
    GOAL * (s.goals - s.penaltyGoals) +
    PENALTY_GOAL * s.penaltyGoals +
    ASSIST * s.assists +
    OWN_GOAL * s.ownGoals +
    SHOT_SAVED * saved +
    SHOT_MISSED * missed +
    PASS * s.passes +
    MISPLACED_PASS * s.misplacedPasses +
    TACKLE * s.tackles +
    FOUL * (s.fouls - s.yellowCards - s.redCards) +
    YELLOW * s.yellowCards +
    RED * s.redCards +
    PENALTY_MISSED * s.penaltiesMissed +
    SAVE * (s.saves - s.penaltiesSaved) +
    PENALTY_SAVED * s.penaltiesSaved +
    CONCEDED[s.group] * s.conceded +
    (isCleanSheet && s.minutes >= CLEAN_SHEET_MINUTES ? CLEAN_SHEET[s.group] : 0)
  );
}

/** The play of a match saved before players had one: everyone in neutral form, doing only what the timeline says. */
function timelineOnly(sides: { home: RatedSide; away: RatedSide }): MatchPlay {
  const players: MatchPlay["players"] = {};
  for (const side of [sides.home, sides.away]) {
    for (const p of [...side.starters, ...side.bench]) {
      players[p.id] ??= { clubId: p.clubId, group: p.group, form: 0, shots: [], tackles: [], fouls: [], passes: 0, misplaced: 0 };
    }
  }
  return { starters: [...sides.home.starters, ...sides.away.starters].map((p) => p.id), players };
}

/**
 * Every player who took part in the match, rated 0 to 10 in tenths from what he did (playerStatsAt)
 * and how his side did, on the spread of FotMob's Série A ratings for his position.
 */
export function matchRatings(sides: { home: RatedSide; away: RatedSide }, events: readonly MatchEvent[], play: MatchPlay = timelineOnly(sides)): { home: PlayerRating[]; away: PlayerRating[] } {
  const stats = playerStatsAt(play, events, FULL_TIME);
  const goalsOf = (clubId: string) => events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
  const rate = (own: RatedSide, other: RatedSide): PlayerRating[] => {
    const { players } = whoPlayed(own.starters, own.bench, events, own.clubId);
    const margin = Math.sign(goalsOf(own.clubId) - goalsOf(other.clubId));
    const isCleanSheet = goalsOf(other.clubId) === 0;
    return players.map((player) => {
      const s = stats[player.id];
      const score = s ? scoreOf({ ...s, group: player.group }, margin, isCleanSheet) : 0;
      const fotmob = FOTMOB[player.group];
      const scores = SCORES[player.group];
      const rating = fotmob.mean + (fotmob.sd * (score - scores.mean)) / scores.sd;
      return { playerId: player.id, rating: Math.round(Math.min(HIGHEST, Math.max(LOWEST, rating)) * 10) / 10 };
    });
  };
  return { home: rate(sides.home, sides.away), away: rate(sides.away, sides.home) };
}
