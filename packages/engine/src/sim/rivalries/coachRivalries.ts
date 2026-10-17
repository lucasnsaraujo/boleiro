import { coachesByClub } from "../coach/aiCoaches.js";
import { humanKey } from "../coach/closeCoachSeason.js";
import { humanClubIds, waitingCoachesOf } from "../coach/humanCoaches.js";
import type { Fixture, GameState } from "../gameState.js";
import type { HumanCoach } from "./idols.js";
import { pairKeyOf, rivalryMemoryOf, type CoachRivalry, type RivalryMemory } from "./rivalryMemory.js";
import { rivalryOf } from "./rivalryOf.js";

// guess: a rivalry between coaches is a point a meeting, three a final and two a press clash; from six
// points (six meetings, or two finals, or a few meetings and a clash) the papers treat it as one.
const FINAL_POINTS = 3;
const CLASH_POINTS = 2;
export const RIVALRY_POINTS = 6;
// guess: four wins without a defeat make the other coach a freguês, as the papers say of a side.
export const FREGUESIA_WINS = 4;
// guess: a press answer that adds this much heat to a rivalry (the provocations) is a clash with the rival's coach.
export const CLASH_HEAT = 4;

/** How heated two coaches' rivalry is: their meetings, finals and press clashes. */
export function coachRivalryScore(rivalry: Pick<CoachRivalry, "meetings" | "finals" | "clashes">): number {
  return rivalry.meetings + FINAL_POINTS * rivalry.finals + CLASH_POINTS * rivalry.clashes;
}

/** Each human coach of the game with the club he runs (null when out of work), the one in the seat first. */
export function humanCoachesOf(state: GameState): (HumanCoach & { clubId: string | null })[] {
  return [
    { name: state.coachName, record: state.history.coach, clubId: state.coachClubId },
    ...waitingCoachesOf(state).map((waiting) => ({ name: waiting.name, record: waiting.record, clubId: waiting.clubId })),
  ];
}

/** The key of the coach running a club: a human's `humanKey`, an AI coach's id; null when it has none. */
export function coachKeyAt(state: GameState, clubId: string, aiCoaches = coachesByClub(state.coaches ?? { coaches: {} })): string | null {
  const human = humanCoachesOf(state).find((coach) => coach.clubId === clubId);
  return human ? humanKey(human.name) : (aiCoaches.get(clubId)?.id ?? null);
}

/** A coach's name by key, as the papers print it. */
export function coachNameOf(state: GameState, key: string): string {
  const human = humanCoachesOf(state).find((coach) => humanKey(coach.name) === key);
  if (human) return human.name || "o técnico";
  return state.coaches?.coaches[key]?.name ?? "o técnico";
}

const isHumanKey = (key: string) => key.startsWith(humanKey(""));

/** Whether a fixture is its competition's final. */
export function isFinal(state: Pick<GameState, "competitions">, fixture: Pick<Fixture, "competitionId" | "stage">): boolean {
  const competition = state.competitions[fixture.competitionId];
  if (!competition) return false;
  const isKnockout = competition.kind === "cup" || competition.stages[fixture.stage]?.kind === "knockout";
  return isKnockout && fixture.stage === competition.stageDates.length - 1;
}

/** The side that won a played fixture, on penalties too; null for a draw or a game not played. */
export function winnerOf(fixture: Fixture): string | null {
  const result = fixture.result;
  if (!result) return null;
  const margin = result.homeGoals - result.awayGoals;
  if (margin > 0 || result.penaltyWinnerId === fixture.homeId) return fixture.homeId;
  if (margin < 0 || result.penaltyWinnerId === fixture.awayId) return fixture.awayId;
  return null;
}

/** One coach's rivalry with another as he sees it: the other's key, his wins and defeats, and how heated it is. */
export type CoachRivalryView = { opponent: string; meetings: number; wins: number; losses: number; draws: number; finals: number; clashes: number; score: number };

/** A coach's rivalries with other coaches, the most heated first. */
export function coachRivalriesOf(state: Pick<GameState, "rivalries">, coachKey: string): CoachRivalryView[] {
  return Object.values(rivalryMemoryOf(state).coaches)
    .filter((r) => r.a === coachKey || r.b === coachKey)
    .map((r) => {
      const isA = r.a === coachKey;
      return { opponent: isA ? r.b : r.a, meetings: r.meetings, wins: isA ? r.aWins : r.bWins, losses: isA ? r.bWins : r.aWins, draws: r.draws, finals: r.finals, clashes: r.clashes, score: coachRivalryScore(r) };
    })
    .sort((x, y) => y.score - x.score || x.opponent.localeCompare(y.opponent));
}

/** The coach (by key) who has never beaten the other in at least FREGUESIA_WINS meetings; null when neither is. */
export function freguesOf(rivalry: CoachRivalry): string | null {
  if (rivalry.aWins >= FREGUESIA_WINS && rivalry.bWins === 0) return rivalry.b;
  if (rivalry.bWins >= FREGUESIA_WINS && rivalry.aWins === 0) return rivalry.a;
  return null;
}

function withPair(memory: RivalryMemory, x: string, y: string, change: (rivalry: CoachRivalry, isXFirst: boolean) => CoachRivalry): RivalryMemory {
  const key = pairKeyOf(x, y);
  const [a, b] = x < y ? [x, y] : [y, x];
  const known = memory.coaches[key] ?? { a, b, meetings: 0, aWins: 0, bWins: 0, draws: 0, finals: 0, clashes: 0, lastMet: "" };
  return { ...memory, coaches: { ...memory.coaches, [key]: change(known, a === x) } };
}

/**
 * The human coaches' meetings of the day: each match a human coach's club played adds to his record
 * against the coach across the touchline (as `before`, the day's start, had them), and a derby he won
 * to his derbies at the club.
 */
export function recordCoachMeetings(state: GameState, played: readonly Fixture[], before: GameState): GameState {
  const humans = new Set(humanClubIds(before));
  const own = played.filter((f) => f.result && (humans.has(f.homeId) || humans.has(f.awayId)));
  if (!own.length) return state;
  const aiCoaches = coachesByClub(before.coaches ?? { coaches: {} });
  let memory = rivalryMemoryOf(state);
  for (const fixture of own) {
    const home = coachKeyAt(before, fixture.homeId, aiCoaches);
    const away = coachKeyAt(before, fixture.awayId, aiCoaches);
    const winner = winnerOf(fixture);
    const winnerKey = winner === fixture.homeId ? home : winner === fixture.awayId ? away : null;
    if (home && away && home !== away) {
      const final = isFinal(before, fixture) ? 1 : 0;
      memory = withPair(memory, home, away, (r) => ({
        ...r,
        meetings: r.meetings + 1,
        aWins: r.aWins + (winnerKey === r.a ? 1 : 0),
        bWins: r.bWins + (winnerKey === r.b ? 1 : 0),
        draws: r.draws + (winnerKey === null ? 1 : 0),
        finals: r.finals + final,
        lastMet: fixture.date,
      }));
    }
    if (winner && winnerKey && isHumanKey(winnerKey) && rivalryOf(fixture.homeId, fixture.awayId)) {
      const wins = memory.derbyWins[winnerKey] ?? {};
      memory = { ...memory, derbyWins: { ...memory.derbyWins, [winnerKey]: { ...wins, [winner]: (wins[winner] ?? 0) + 1 } } };
    }
  }
  return { ...state, rivalries: memory };
}

/** A human coach's heated press answer about a rival club, counted as a clash with that club's coach. */
export function recordPressClash(state: GameState, clubId: string, rivalClubId: string): GameState {
  const human = humanCoachesOf(state).find((coach) => coach.clubId === clubId);
  const other = coachKeyAt(state, rivalClubId);
  if (!human || !other) return state;
  const key = humanKey(human.name);
  if (key === other) return state;
  return { ...state, rivalries: withPair(rivalryMemoryOf(state), key, other, (r) => ({ ...r, clashes: r.clashes + 1 })) };
}
