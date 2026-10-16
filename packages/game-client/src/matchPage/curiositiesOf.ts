import type { Fixture, GameState } from "@boleiro/engine/sim/gameState";
import { competitionKey } from "@boleiro/engine/sim/history/history";
import { formatDayMonth } from "../format/formatGameDate.js";

type Score = { home: number; away: number };

/** What the curiosities read of a match: the season around it, its score once it ended, and its scorers when its timeline is the real one. */
export type CuriosityMatch = {
  state: Pick<GameState, "fixtures" | "history" | "season">;
  fixture: Fixture;
  /** The final score; null while the match is under way. */
  score: Score | null;
  /** One entry per goal, own goals left out; null when the timeline was told again from the seed and its scorers are not the real ones. */
  scorers: { playerId: string; clubId: string }[] | null;
  /** The paying crowd, when the gate is known. */
  crowd: number | null;
  competitionName: string;
  clubName: (clubId: string) => string;
  playerName: (playerId: string) => string;
};

type CuriosityRule = (match: CuriosityMatch) => string | null;

// guess: a run is worth a line from five games on.
const NOTABLE_RUN = 5;
const MOST_CURIOSITIES = 3;
// guess: a scorer's tally is news from his third goal of the competition on, or when he scores twice today.
const NOTABLE_TALLY = 3;

/** The club's games before this one this season, newest first, with their outcome for it. */
function gamesBefore(match: CuriosityMatch, clubId: string): ("win" | "draw" | "loss")[] {
  return match.state.fixtures
    .filter((f) => f.result && f.id !== match.fixture.id && f.date < match.fixture.date && (f.homeId === clubId || f.awayId === clubId))
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .flatMap((f) => {
      if (!f.result) return [];
      const [own, other] = f.homeId === clubId ? [f.result.homeGoals, f.result.awayGoals] : [f.result.awayGoals, f.result.homeGoals];
      return [own > other ? "win" : own === other ? "draw" : "loss"] as const;
    });
}

const runOf = (games: readonly string[], keeps: (outcome: string) => boolean) => {
  const end = games.findIndex((outcome) => !keeps(outcome));
  return end < 0 ? games.length : end;
};

/** A side's unbeaten or winless run: ended by today's result, or carried into a match under way. */
const runs: CuriosityRule = (match) => {
  for (const side of ["home", "away"] as const) {
    const clubId = side === "home" ? match.fixture.homeId : match.fixture.awayId;
    const name = match.clubName(clubId);
    const games = gamesBefore(match, clubId);
    const unbeaten = runOf(games, (o) => o !== "loss");
    const winless = runOf(games, (o) => o !== "win");
    const { score } = match;
    if (!score) {
      if (unbeaten >= NOTABLE_RUN) return `${name} chega invicto há ${unbeaten} jogos.`;
      if (winless >= NOTABLE_RUN) return `${name} chega sem vencer há ${winless} jogos.`;
      continue;
    }
    const [own, other] = side === "home" ? [score.home, score.away] : [score.away, score.home];
    if (own < other && unbeaten >= NOTABLE_RUN) return `${name} não perdia havia ${unbeaten} jogos. A série acabou aqui.`;
    if (own > other && winless >= NOTABLE_RUN) return `${name} não vencia havia ${winless} jogos. Voltou a vencer.`;
  }
  return null;
};

/** The day's best scorer with his tally in the competition so far, from the season's real goals. */
const scorerTally: CuriosityRule = (match) => {
  if (!match.scorers?.length) return null;
  const today = new Map<string, number>();
  for (const { playerId } of match.scorers) today.set(playerId, (today.get(playerId) ?? 0) + 1);
  const goals = match.state.history.current.goals[competitionKey(match.fixture.competitionId)] ?? {};
  const [playerId, scored] = [...today].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  const total = (goals[playerId] ?? 0) + scored;
  if (total < NOTABLE_TALLY && scored < 2) return null;
  const name = match.playerName(playerId);
  const where = `${match.competitionName} ${match.state.season}`;
  return scored > 1 ? `${name} fez ${scored} gols e chega a ${total} na ${where}.` : `${name} chega a ${total} gols na ${where}.`;
};

/** A record the match set in the club's history, which starts with the save. */
const records: CuriosityRule = (match) => {
  const { fixture } = match;
  const since = match.state.history.seasons[0]?.season ?? match.state.season;
  const home = match.state.history.clubs[fixture.homeId];
  const isThis = (mark: { date: string; opponentId: string } | null | undefined, opponentId: string) => mark?.date === fixture.date && mark.opponentId === opponentId;
  if (match.crowd && isThis(home?.biggestCrowd, fixture.awayId)) return `${match.clubName(fixture.homeId)}: maior público em casa desde ${since}.`;
  for (const [clubId, opponentId] of [
    [fixture.homeId, fixture.awayId],
    [fixture.awayId, fixture.homeId],
  ] as const) {
    const win = match.state.history.clubs[clubId]?.biggestWin;
    if (match.score && isThis(win, opponentId) && win && win.goalsFor - win.goalsAgainst >= 3) return `${match.clubName(clubId)}: maior vitória desde ${since}.`;
  }
  return null;
};

/** How the two sides' last meeting this season ended. */
const lastMeeting: CuriosityRule = (match) => {
  const { fixture } = match;
  const pair = new Set([fixture.homeId, fixture.awayId]);
  const last = match.state.fixtures
    .filter((f) => f.result && f.id !== fixture.id && f.date < fixture.date && pair.has(f.homeId) && pair.has(f.awayId))
    .toSorted((a, b) => b.date.localeCompare(a.date))[0];
  if (!last?.result) return null;
  return `Na última vez, em ${formatDayMonth(last.date)}, deu ${match.clubName(last.homeId)} ${last.result.homeGoals} × ${last.result.awayGoals} ${match.clubName(last.awayId)}.`;
};

/**
 * Every rule that can tell something about a match, most telling first. Each reads only the game's
 * real state; events and easter eggs bring their own rules here.
 */
const RULES: readonly CuriosityRule[] = [runs, scorerTally, records, lastMeeting];

/** Up to three true facts about a match, from the game's state; none when nothing stands out. */
export function curiositiesOf(match: CuriosityMatch): string[] {
  return RULES.flatMap((rule) => rule(match) ?? []).slice(0, MOST_CURIOSITIES);
}
