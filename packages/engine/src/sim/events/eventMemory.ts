import type { GameState, IsoDate } from "../gameState.js";

/**
 * What an event moves, in the units the coach sees: `morale` and `fans` in points of the 0–100 meters,
 * `board` in points of the board's confidence meter, `money` in BRL (in when positive, out when
 * negative), `rivalry` in heat points with the event's rival, `outDays` days the event's player misses.
 */
export type Effects = {
  morale?: number;
  fans?: number;
  board?: number;
  money?: number;
  rivalry?: number;
  outDays?: number;
  /** The coach's hired assistant leaves, and the club's own takes over again. */
  releasesAssistant?: true;
};

/** The area of a club's life an event touches, and the switch that hands its events to the assistant. */
export type EventArea = "players" | "squad" | "board" | "fans" | "press";

/** What an event is about, finer than its area: the newspaper's section for it. */
export type EventTopic = "players" | "squad" | "board" | "fans" | "press" | "staff" | "rivals" | "sponsors" | "life" | "discipline" | "health";

/** One answer of an event as the coach reads it. */
export type EventChoice = { label: string; detail?: string; effects: Effects };

/** Who an event is about, besides its club: one of its players, a teammate of his, a rival club. */
export type Cast = { playerId?: string; teammateId?: string; rivalId?: string };

/**
 * One event that happened, as the game remembers it: its type, day, club, cast and the answer taken;
 * a press conference also keeps the questions asked (`questionIds`) and each answer (`answers`).
 */
export type EventRecord = Cast & { typeId: string; date: IsoDate; clubId: string; choice?: number; questionIds?: string[]; answers?: number[] };

/** One question of a press conference as the coach reads it, with its answers. */
export type PendingQuestion = { id: string; ask: string; choices: EventChoice[]; assistantChoice: number };

/** An event waiting for a human coach's answer, with its texts already filled in. */
export type PendingEvent = EventRecord & {
  area: EventArea;
  /** "press" opens the press conference; "card" the event card. */
  look: "card" | "press";
  headline: string;
  body: string;
  /** Where and when it reached the coach ("No CT, depois do treino"). */
  setting: string;
  choices: EventChoice[];
  /** The answer the assistant gives when the coach leaves it to him or lets it lapse. */
  assistantChoice: number;
  /** The assistant answers at the end of this day, the club's next match day, if the coach hasn't. */
  expiresOn: IsoDate;
  topic?: EventTopic;
  /**
   * A press conference's questions, in the order asked; `body`, `choices` and `assistantChoice` are
   * always the one waiting now, the first not in `answers`. Missing in a single-question event.
   */
  questions?: PendingQuestion[];
};

export type NewsKind = "event" | "match" | "signing" | "sacking" | "upset" | "rivalry" | "var" | "controversy" | "award" | "record" | "egg" | "career";

/**
 * One story for the round's newspaper. `clubIds` are the clubs it is about, the main one first; an
 * event's story has its `topic`, missing in a save from before topics.
 */
export type NewsItem = { date: IsoDate; kind: NewsKind; clubIds: string[]; headline: string; body: string; topic?: EventTopic };

/**
 * Everything the event engine remembers: the events that happened (`log`, oldest first), each human
 * club's event waiting for an answer, the newspaper's recent stories, and rivalry heat between pairs of
 * clubs (`rivalryKey`). Match pages read the same memory through `eventsOf`; easter eggs print their
 * stories in its newspaper and keep their finds in an egg book of their own (`eggBookOf`).
 */
export type EventMemory = { log: EventRecord[]; pending: Record<string, PendingEvent>; news: NewsItem[]; rivalry: Record<string, number> };

export const EMPTY_MEMORY: EventMemory = { log: [], pending: {}, news: [], rivalry: {} };

/** The game's event memory; a save from before events has an empty one. */
export const eventMemoryOf = (state: Pick<GameState, "eventMemory">): EventMemory => state.eventMemory ?? EMPTY_MEMORY;

// guess: a feud the clubs leave alone loses half its heat every season, so one hot year fades in two or three.
const HEAT_KEPT_PER_SEASON = 0.5;

/** The game at the turn of the season, each pair's rivalry heat cooled and the pairs gone cold dropped. */
export function coolRivalries(state: GameState): GameState {
  const memory = state.eventMemory;
  if (!memory || !Object.keys(memory.rivalry).length) return state;
  const rivalry: Record<string, number> = {};
  for (const [key, heat] of Object.entries(memory.rivalry)) {
    const kept = Math.floor(heat * HEAT_KEPT_PER_SEASON);
    if (kept > 0) rivalry[key] = kept;
  }
  return { ...state, eventMemory: { ...memory, rivalry } };
}

/** The key of a pair of clubs in `EventMemory.rivalry`, the same either way round. */
export const rivalryKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type EventQuery = { typeId?: string; clubId?: string; playerId?: string; since?: IsoDate; until?: IsoDate };

/** A log read by type and club: its records, each type's last day at each club and the players each type already had; `size` records read. */
type LogIndex = { records: Map<string, EventRecord[]>; lastAt: Map<string, IsoDate>; players: Set<string>; size: number; first: EventRecord | undefined; last: EventRecord | undefined };

const emptyIndex = (): LogIndex => ({ records: new Map(), lastAt: new Map(), players: new Set(), size: 0, first: undefined, last: undefined });

// A log only grows, each event added into a new array, so the index of the last log read is extended with the
// records added since instead of reading a career's whole log again every day: the events check every club's
// cooldowns and the chemistry of every club asks for its fights on every match day. Another log (a save just
// loaded, another game) starts it over.
let lastIndex = emptyIndex();

function indexOf(log: readonly EventRecord[]): LogIndex {
  const known = lastIndex;
  if (known.size === log.length && log[0] === known.first && log[known.size - 1] === known.last) return known;
  const index = known.size <= log.length && log[0] === known.first && log[known.size - 1] === known.last ? known : emptyIndex();
  for (let at = index.size; at < log.length; at++) {
    const record = log[at];
    if (!record) continue;
    const key = `${record.typeId}|${record.clubId}`;
    const records = index.records.get(key);
    if (records) records.push(record);
    else index.records.set(key, [record]);
    const last = index.lastAt.get(key);
    if (!last || last < record.date) index.lastAt.set(key, record.date);
    if (record.playerId) index.players.add(`${record.typeId}|${record.playerId}`);
  }
  index.size = log.length;
  index.first = log[0];
  index.last = log[log.length - 1];
  lastIndex = index;
  return index;
}

/** The last day an event of type `typeId` happened at `clubId`, by the log; undefined when it never did. */
export const lastEventDay = (log: readonly EventRecord[], typeId: string, clubId: string): IsoDate | undefined => indexOf(log).lastAt.get(`${typeId}|${clubId}`);

/** Whether an event of type `typeId` already had `playerId` in it, by the log. */
export const hasHadPlayer = (log: readonly EventRecord[], typeId: string, playerId: string): boolean => indexOf(log).players.has(`${typeId}|${playerId}`);

/** The events that happened matching every field given, oldest first. */
export function eventsOf(state: Pick<GameState, "eventMemory">, query: EventQuery): EventRecord[] {
  const { log } = eventMemoryOf(state);
  const records = query.typeId !== undefined && query.clubId !== undefined ? (indexOf(log).records.get(`${query.typeId}|${query.clubId}`) ?? []) : log;
  return records.filter(
    (record) =>
      (query.typeId === undefined || record.typeId === query.typeId) &&
      (query.clubId === undefined || record.clubId === query.clubId) &&
      (query.playerId === undefined || record.playerId === query.playerId) &&
      (query.since === undefined || record.date >= query.since) &&
      (query.until === undefined || record.date <= query.until),
  );
}

/** The event waiting for an answer from the coach of `clubId`, if any. */
export const pendingEventOf = (state: Pick<GameState, "eventMemory">, clubId: string | null): PendingEvent | null =>
  (clubId !== null && eventMemoryOf(state).pending[clubId]) || null;
