import type { PositionGroup } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import type { GameState, IsoDate } from "../gameState.js";
import { boardRefusal } from "../transfers/boardRefusal.js";
import { unitHash } from "../transfers/coachMarket.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import type { Coach } from "./coach.js";
import { coachSalary } from "./coachSalary.js";
import { asWaitingCoach, waitingCoachesOf } from "./humanCoaches.js";
import { inventCoachName } from "./inventCoachName.js";

export const ASSISTANT_LEVELS = [1, 2, 3, 4, 5] as const;
export type AssistantLevel = (typeof ASSISTANT_LEVELS)[number];

/**
 * The coach's assistant. `wage` is monthly, in BRL, on top of the club's wages: the club's own assistant
 * costs nothing more. A player of the coach's who retired and took the job keeps his position group and peak.
 */
export type Assistant = {
  id: string;
  name: string;
  age: number;
  level: AssistantLevel;
  wage: number;
  /** The day he started with the coach; the club's own assistant was there before him. */
  since?: IsoDate;
  formerPlayer?: { group: PositionGroup; peak: number };
};

/** A player who retired at the coach's club, in the season he stopped in. */
export type FormerPlayer = { playerId: string; name: string; group: PositionGroup; peak: number; age: number; retiredSeason: number };

/** Someone the coach can call to be his assistant, at the wage he asks; `years` in the job, or since he retired for a former player. */
export type AssistantCandidate = Assistant & { years: number };

/** Why the coach could not hire him. */
export type AssistantRefusal = "noClub" | "unknown" | "wageCap";

/**
 * The wage a stranger of each level asks, as a share of the head coach's salary (coachSalary). One
 * published case: Flamengo's head coach on R$ 300k a month (Exame, 2025-11-30,
 * https://exame.com/esporte/qual-o-salario-do-filipe-luis-tecnico-campeao-da-libertadores/) and his
 * staff of four assistants costing about R$ 800k with him (Terra Brasil Notícias, 2024-11,
 * https://terrabrasilnoticias.com/2024/11/voce-nao-vai-acreditar-no-salario-de-filipe-luis-como-tecnico-do-flamengo/),
 * about 40% of his salary each. guess: a top lead assistant earns that, a modest one far less.
 */
const WAGE_SHARE: Record<Exclude<AssistantLevel, 1>, number> = { 2: 0.1, 3: 0.18, 4: 0.28, 5: 0.4 };
// guess: a former player of the coach's asks for this share of a stranger's wage at his level: he wants the job.
const FORMER_PLAYER_DISCOUNT = 0.6;
// guess: a retired star (peak 80+, a Série A star) reads the game like the best assistants; a solid
// pro (76+) one level less; any other former player of the coach's still knows him and the squad.
const FORMER_PLAYER_LEVELS: readonly [minPeak: number, level: AssistantLevel][] = [[80, 5], [76, 4], [0, 3]];
// guess: the coach remembers the last few players who retired under him.
const FORMER_PLAYERS_KEPT = 6;
/**
 * guess: the most strength points an assistant's read of a player is off, by level. A level-1
 * assistant can rate a 70 anywhere from 62 to 78; a level-5 one is never more than a point out.
 */
const READ_ERROR: Record<AssistantLevel, number> = { 1: 8, 2: 6, 3: 4, 4: 2, 5: 1 };
// guess: how many stars narrower than the club's scouts he reads a kid's potential, by level: a level-5
// assistant sees it exactly from the first look, levels 3 and 4 a star closer, 1 and 2 as the scouts do.
const SCOUT_SHARPENING: Record<AssistantLevel, number> = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 };
// guess: assistants on the market are 38 to 62 years old and started at 35.
const AGES = { min: 38, span: 25, startedAt: 35 };
const ASSISTANT_SALT = 0xa55157;

/** The most strength points his read of a player is off at `level`. */
export const readErrorAt = (level: AssistantLevel): number => READ_ERROR[level];

/** How many stars narrower than the club's scouts an assistant of `level` reads the kids' potential (scoutedStars). */
export const scoutSharpeningAt = (level: AssistantLevel): number => SCOUT_SHARPENING[level];

function invented(state: Pick<GameState, "seed">, key: string): { name: string; age: number } {
  const random = keyedStream((state.seed ^ ASSISTANT_SALT) >>> 0, key);
  const { name } = inventCoachName("br", random);
  return { name, age: AGES.min + Math.floor(random() * AGES.span) };
}

/** The assistant every club has on its staff, level 1, the coach's until he hires another. */
export function clubAssistant(state: Pick<GameState, "seed">, clubId: string | null): Assistant {
  const key = `club:${clubId ?? ""}`;
  return { id: key, ...invented(state, key), level: 1, wage: 0 };
}

/** The assistant of the coach in the seat: the one he hired, else his club's own. */
export function assistantOf(state: Pick<GameState, "seed" | "coach" | "coachClubId">): Assistant {
  return state.coach.assistant ?? clubAssistant(state, state.coachClubId);
}

/** The assistant of the human coach who runs `clubId`, in the seat or waiting; any other club's is its own. */
export function assistantOfClub(state: Pick<GameState, "seed" | "coach" | "coachClubId" | "waitingCoaches">, clubId: string): Assistant {
  if (clubId === state.coachClubId) return assistantOf(state);
  return waitingCoachesOf(state).find((waiting) => waiting.clubId === clubId)?.coach.assistant ?? clubAssistant(state, clubId);
}

/**
 * How the assistant reads a player: his strength off by up to his level's error, the same each time he
 * looks at that player in a season and different from what another assistant sees.
 */
export function assistantReadOf(state: Pick<GameState, "seed" | "season">, assistant: Pick<Assistant, "id" | "level">): (playerId: string, strength: number) => number {
  const error = READ_ERROR[assistant.level];
  return (playerId, strength) => strength + error * (2 * unitHash(`${state.seed}:${assistant.id}:${state.season}:${playerId}`) - 1);
}

const strangerWage = (state: Pick<GameState, "players">, clubId: string, level: Exclude<AssistantLevel, 1>) => Math.round(WAGE_SHARE[level] * coachSalary(state, clubId));

function formerPlayerLevel(peak: number): AssistantLevel {
  return FORMER_PLAYER_LEVELS.find(([minPeak]) => peak >= minPeak)?.[1] ?? 3;
}

/**
 * Who the coach in the seat can call: a stranger for each level above his assistant's, the season's
 * market, and each player who retired under him at a level above it, for less than a stranger asks.
 * Without a club nobody comes.
 */
export function assistantCandidates(state: Pick<GameState, "seed" | "season" | "coach" | "coachClubId" | "players">): AssistantCandidate[] {
  const clubId = state.coachClubId;
  if (!clubId) return [];
  const current = assistantOf(state);
  const strangers = ASSISTANT_LEVELS.flatMap((level): AssistantCandidate[] => {
    if (level === 1 || level <= current.level) return [];
    const id = `market:${state.season}:${level}`;
    const { name, age } = invented(state, id);
    return [{ id, name, age, level, wage: strangerWage(state, clubId, level), years: age - AGES.startedAt }];
  });
  const formers = (state.coach.formerPlayers ?? []).flatMap((former): AssistantCandidate[] => {
    const id = `former:${former.playerId}`;
    const level = formerPlayerLevel(former.peak);
    if (level <= current.level || id === current.id || level === 1) return [];
    const wage = Math.round(FORMER_PLAYER_DISCOUNT * strangerWage(state, clubId, level));
    const age = former.age + state.season - former.retiredSeason;
    return [{ id, name: former.name, age, level, wage, years: state.season - former.retiredSeason, formerPlayer: { group: former.group, peak: former.peak } }];
  });
  return [...strangers, ...formers];
}

/** The coach in the seat hires a candidate in place of his assistant, if his board can pay him. */
export function hireAssistant(state: GameState, candidateId: string): { state: GameState; refusal: AssistantRefusal | null } {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance) return { state, refusal: "noClub" };
  const candidate = assistantCandidates(state).find((c) => c.id === candidateId);
  if (!candidate) return { state, refusal: "unknown" };
  const wageChange = candidate.wage - assistantOf(state).wage;
  if (boardRefusal(finance, wageBillsOf(state).get(clubId) ?? 0, { upFront: 0, wageChange })) return { state, refusal: "wageCap" };
  const { id, name, age, level, wage, formerPlayer } = candidate;
  const assistant: Assistant = { id, name, age, level, wage, since: state.date, ...(formerPlayer ? { formerPlayer } : {}) };
  return { state: { ...state, coach: { ...state.coach, assistant } }, refusal: null };
}

/** The coach in the seat lets his assistant go; the club's own takes over again. */
export function fireAssistant(state: GameState): GameState {
  if (!state.coach.assistant) return state;
  const coach = { ...state.coach };
  Reflect.deleteProperty(coach, "assistant");
  return { ...state, coach };
}

/** The coach with the players who retired at his club today added to the ones he remembers. */
function withFormerPlayers(coach: Coach, clubId: string | null, before: Pick<GameState, "players" | "history" | "season">, retired: readonly Extract<DayEvent, { type: "playerRetired" }>[]): Coach {
  const added = retired.flatMap((event): FormerPlayer[] => {
    const player = before.players[event.playerId];
    if (!player || event.clubId !== clubId) return [];
    const peak = Math.max(player.strength, ...(before.history.strength[event.playerId] ?? []).map((mark) => mark.strength));
    return [{ playerId: event.playerId, name: event.name, group: player.group, peak: Math.round(peak), age: event.age, retiredSeason: before.season }];
  });
  return added.length ? { ...coach, formerPlayers: [...(coach.formerPlayers ?? []), ...added].slice(-FORMER_PLAYERS_KEPT) } : coach;
}

/**
 * Every human coach remembers the players who retired at his club at the season's turn (`events`,
 * the turn's playerRetired), read from `before`, the game of the season that ended.
 */
export function recordFormerPlayers(state: GameState, before: Pick<GameState, "players" | "history" | "season">, events: readonly DayEvent[]): GameState {
  const retired = events.filter((event): event is Extract<DayEvent, { type: "playerRetired" }> => event.type === "playerRetired");
  if (!retired.length) return state;
  let next: GameState = { ...state, coach: withFormerPlayers(state.coach, state.coachClubId, before, retired) };
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    next = asWaitingCoach(next, index, (seated) => ({ state: { ...seated, coach: withFormerPlayers(seated.coach, seated.coachClubId, before, retired) } })).state;
  }
  return next;
}
