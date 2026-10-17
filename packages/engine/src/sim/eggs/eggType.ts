import type { PositionGroup } from "../../engine/match.js";
import type { DayEvent } from "../advanceDay.js";
import type { Fixture, GameState, IsoDate, MatchResult } from "../gameState.js";
import type { CoachRecord } from "../history/history.js";
import type { MatchEvent } from "../live/matchTimeline.js";

/** How rare an egg is for one human coach's club: about once a season or two, once in several seasons, once in a career. */
export type EggRarity = "rare" | "veryRare" | "legendary";

/** What a find leaves besides its newspaper clipping: a rare sticker, or a special album page. */
export type EggLook = "clipping" | "sticker" | "page";

/** A newspaper story; slots in braces ({club}, {opponent}, {player}, {coach}, {score} and the egg's own) take real names. */
export type EggText = { headline: string; body: string };

/** One of a human coach's club's matches, played, as the eggs read it. */
export type MatchTale = {
  fixture: Fixture & { result: MatchResult };
  /** The last tie of a knockout competition. */
  isFinal: boolean;
  isDerby: boolean;
  events: readonly MatchEvent[];
  /** The position group of everyone who took part, by player id. */
  groups: Readonly<Record<string, PositionGroup>>;
  /** The club of everyone on the team sheets, by player id. */
  clubOf: Readonly<Record<string, string>>;
  /** The age of everyone who took part, by player id. */
  ages: Readonly<Record<string, number>>;
  /** The name of everyone on the team sheets, by player id. */
  names: Readonly<Record<string, string>>;
  /** The shots that came back off the post or the bar. */
  woodwork: readonly { clubId: string; playerId: string; minute: number }[];
  /** The players in their first match for their club. */
  debutants: ReadonlySet<string>;
  /** The names of the game's human coaches. */
  coachNames: readonly string[];
};

/**
 * Where a day egg looks: the game before and after the day `date`, a human coach's club and the coach
 * (his name, empty when the game doesn't know it, and his career), the names of the other human
 * coaches, the day's matches and events, and the egg's own stream for the day and club.
 */
export type DayScene = {
  before: GameState;
  state: GameState;
  date: IsoDate;
  clubId: string;
  coach: { name: string; record: CoachRecord };
  otherCoachNames: readonly string[];
  played: readonly Fixture[];
  events: readonly DayEvent[];
  random: () => number;
};

/**
 * An egg found: the club it happened to, the names its texts take, the player it is about (a player
 * egg is found once per player), and for a kid named after a coach his new name.
 */
export type EggHit = { clubId: string; slots?: Record<string, string>; playerId?: string; rename?: { prospectId: string; name: string }[] };

type EggBase = {
  id: string;
  /** The sticker's caption. */
  title: string;
  rarity: EggRarity;
  look: EggLook;
  texts: readonly EggText[];
  /** Found once per player in a career, not each time it happens. */
  once?: "player";
};

/** An egg a match lays: `note` is the line the match page tapes beside it. */
export type MatchEgg = EggBase & { on: "match"; note: string; find: (tale: MatchTale) => EggHit[] };
/** An egg of the calendar, the academy or the season, looked for at the end of each day. */
export type DayEgg = EggBase & { on: "day"; find: (scene: DayScene) => EggHit | null };
/** An egg the coach finds on the screen (a word typed), told to the game as a command. */
export type CoachEgg = EggBase & { on: "coach" };

export type EggType = MatchEgg | DayEgg | CoachEgg;
