import type { GameState, IsoDate } from "../gameState.js";

/**
 * What an event moves, in the units the coach sees: `morale` and `fans` in points of the 0–100 meters,
 * `board` in points of the board's confidence meter, `money` in BRL (in when positive, out when
 * negative), `rivalry` in heat points with the event's rival, `outDays` days the event's player misses.
 */
export type Effects = { morale?: number; fans?: number; board?: number; money?: number; rivalry?: number; outDays?: number };

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

export type NewsKind = "event" | "match" | "signing" | "sacking" | "upset" | "rivalry" | "var" | "controversy" | "award" | "record";

/**
 * One story for the round's newspaper. `clubIds` are the clubs it is about, the main one first; an
 * event's story has its `topic`, missing in a save from before topics.
 */
export type NewsItem = { date: IsoDate; kind: NewsKind; clubIds: string[]; headline: string; body: string; topic?: EventTopic };

/**
 * Everything the event engine remembers: the events that happened (`log`, oldest first), each human
 * club's event waiting for an answer, the newspaper's recent stories, and rivalry heat between pairs of
 * clubs (`rivalryKey`). Easter eggs and match pages read the same memory through `eventsOf`.
 */
export type EventMemory = { log: EventRecord[]; pending: Record<string, PendingEvent>; news: NewsItem[]; rivalry: Record<string, number> };

export const EMPTY_MEMORY: EventMemory = { log: [], pending: {}, news: [], rivalry: {} };

/** The game's event memory; a save from before events has an empty one. */
export const eventMemoryOf = (state: Pick<GameState, "eventMemory">): EventMemory => state.eventMemory ?? EMPTY_MEMORY;

/** The key of a pair of clubs in `EventMemory.rivalry`, the same either way round. */
export const rivalryKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type EventQuery = { typeId?: string; clubId?: string; playerId?: string; since?: IsoDate; until?: IsoDate };

/** The events that happened matching every field given, oldest first. */
export function eventsOf(state: Pick<GameState, "eventMemory">, query: EventQuery): EventRecord[] {
  return eventMemoryOf(state).log.filter(
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
