import type { Fixture, GameState, IsoDate, SimPlayer } from "../gameState.js";
import type { Cast, Effects, EventArea, EventTopic } from "./eventMemory.js";

/**
 * Where an event is looked at: the game after the day, the club it may happen to and its squad, the day
 * and its matches, and the event's own stream to pick whom it happens to.
 */
export type EventScene = { state: GameState; clubId: string; squad: readonly SimPlayer[]; date: IsoDate; played: readonly Fixture[]; random: () => number };

type ByCast<T extends number | Effects> = T | ((scene: EventScene, cast: Cast) => T);

/** One answer an event offers. `news` is the headline its outcome prints; left out, the event's own. */
export type ChoiceType = { label: string; detail?: string; effects: ByCast<Effects>; news?: string };

/** One headline and body; slots in braces ({player}, {club}, {rival}, {age}, {stadium}, {coach}) take real names. */
export type EventText = { headline: string; body: string };

/**
 * A question a reporter may ask after a press conference's opening one. `cast` says whether it fits the
 * day: the conference's cast with what the question is about added, or null. It may add a player or a
 * rival to the cast, never swap the ones already in it.
 */
export type PressQuestionType = {
  id: string;
  cast: (scene: EventScene, cast: Cast) => Cast | null;
  /** The question as asked, one wording drawn per conference. */
  asks: readonly string[];
  choices: readonly ChoiceType[];
  assistantChoice?: number;
};

/**
 * One kind of event. `cast` is its precondition: who it is about, or null when the game rules it out
 * today. It then competes with the other possible events by `weight`, and can't come back to the same
 * club for `cooldownDays`; `once` keeps it to one time per player in a career.
 * An event with `choices` asks the coach (a pop-up); one without just happens, with its `effects`.
 */
export type EventType = {
  id: string;
  area: EventArea;
  topic: EventTopic;
  look?: "press";
  weight: ByCast<number>;
  cooldownDays: number;
  once?: "player";
  cast: (scene: EventScene) => Cast | null;
  texts: readonly EventText[];
  /** Where it reaches the coach, as the pop-up's first line. */
  setting?: string;
  effects?: ByCast<Effects>;
  choices?: readonly ChoiceType[];
  /** The answer the assistant and the AI clubs give; the first when left out. */
  assistantChoice?: number;
  /** A press conference's other questions: after the opening one, up to two of those that fit the day. */
  followUps?: readonly PressQuestionType[];
};

export const byCast = <T extends number | Effects>(value: ByCast<T>, scene: EventScene, cast: Cast): T => (typeof value === "function" ? value(scene, cast) : value);
