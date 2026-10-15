import { CALIBRATED, pickLineup, simulateMatch, type Team } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import type { GameState, IsoDate } from "../gameState.js";
import { shuffle } from "../shuffle.js";
import type { Copinha, Prospect } from "./academy.js";

export type CopinhaPlayed = { type: "copinhaPlayed"; season: number; championId: string };

/** The Copinha's final falls on São Paulo's anniversary, 25 January; the game plays the whole cup that day, result-only. */
export const copinhaDate = (season: number): IsoDate => `${season}-01-25`;

// guess: the real cup invites 128 clubs; the game's 64 strongest academies, plus the coach's, make a bracket of 64.
const FIELD = 64;
const STARTERS = 11;

const strengthOf = (team: Team) => team.players.reduce((sum, p) => sum + p.strength, 0);

/** The academy's kids as a team, or null when they can't field eleven with a keeper. */
function academyTeam(clubId: string, kids: readonly Prospect[]): Team | null {
  if (kids.length < STARTERS || !kids.some((p) => p.group === "GK")) return null;
  return { name: clubId, players: pickLineup(kids) };
}

/**
 * The year's Copinha among the academies, a single-match knockout from a random draw; a level match
 * goes to a shootout, a coin flip as in the game's other cups. Returns the game unchanged when fewer
 * than two academies can field a side.
 */
export function playCopinha(state: GameState): { state: GameState; events: CopinhaPlayed[] } {
  if (!state.youth) return { state, events: [] };
  const academies = new Map<string, Prospect[]>();
  for (const p of Object.values(state.youth.prospects)) academies.set(p.clubId, [...(academies.get(p.clubId) ?? []), p]);
  const teams = new Map<string, Team>();
  for (const [clubId, kids] of academies) {
    const team = academyTeam(clubId, kids);
    if (team) teams.set(clubId, team);
  }
  const strengths = new Map([...teams].map(([clubId, team]) => [clubId, strengthOf(team)]));
  const ranked = [...teams.keys()].sort((a, b) => (strengths.get(b) ?? 0) - (strengths.get(a) ?? 0) || a.localeCompare(b));
  let size = 1;
  while (size * 2 <= Math.min(FIELD, ranked.length)) size *= 2;
  if (size < 2) return { state, events: [] };
  const field = ranked.slice(0, size);
  const coach = state.coachClubId;
  if (coach && teams.has(coach) && !field.includes(coach)) field[size - 1] = coach;

  const random = randomStream(state.youth.rngState);
  let alive = shuffle(field, random.next);
  const matches: Copinha["matches"] = [];
  for (let round = 0; alive.length > 1; round++) {
    const winners: string[] = [];
    for (let i = 0; i + 1 < alive.length; i += 2) {
      const homeId = alive[i] ?? "";
      const awayId = alive[i + 1] ?? "";
      const home = teams.get(homeId);
      const away = teams.get(awayId);
      if (!home || !away) throw new Error(`no Copinha side for ${homeId} or ${awayId}`);
      const { homeGoals, awayGoals } = simulateMatch(home, away, random.next, CALIBRATED);
      const penaltyWinnerId = homeGoals === awayGoals ? (random.next() < 0.5 ? homeId : awayId) : undefined;
      matches.push({ round, homeId, awayId, homeGoals, awayGoals, ...(penaltyWinnerId ? { penaltyWinnerId } : {}) });
      winners.push(penaltyWinnerId ?? (homeGoals > awayGoals ? homeId : awayId));
    }
    alive = winners;
  }
  const championId = alive[0] ?? "";
  const copinha: Copinha = { season: state.season, matches, championId };
  return {
    state: { ...state, youth: { ...state.youth, copinha, rngState: random.state() } },
    events: [{ type: "copinhaPlayed", season: state.season, championId }],
  };
}

/** How far the club went in the Copinha: the size of the last round it played (2 is the final), whether it won, and its matches. */
export function copinhaRun(copinha: Copinha, clubId: string): { lastRoundSize: number; isChampion: boolean; matches: Copinha["matches"] } | null {
  const matches = copinha.matches.filter((m) => m.homeId === clubId || m.awayId === clubId);
  const last = matches.at(-1);
  if (!last) return null;
  const firstRoundSize = 2 * copinha.matches.filter((m) => m.round === 0).length;
  return { lastRoundSize: firstRoundSize / 2 ** last.round, isChampion: copinha.championId === clubId, matches };
}
