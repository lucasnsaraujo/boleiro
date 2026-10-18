import type { IsoDate } from "../gameState.js";
import type { CoachRecord, CoachStint, CompetitionKey } from "../history/history.js";

/** A coach's games at a club: wins, draws and losses. */
export type Tally = [wins: number, draws: number, losses: number];

/** What moved a coach's standing with a club's fans, in the order the ledger lists it. */
export type IdolCause = "years" | "title" | "derbies" | "left" | "rivalMove";

/** One line of the fans' ledger: its cause, the points it is worth and what it counts (years, derbies won). */
export type IdolEntry = { cause: IdolCause; points: number; count: number; competition?: CompetitionKey; season?: number; left?: NonNullable<CoachStint["left"]> };

/** One of the coach's matches at his club as the board and the fans saw it: the meters right after it, 0 to 100. */
export type PressureMark = { date: IsoDate; opponentId: string; isHome: boolean; goalsFor: number; goalsAgainst: number; board: number; fans: number };

/** The context a title is celebrated in, from the career history the game records. */
export type TitleStory = {
  /** The season of the spell it came in: 1 is his first at the club. */
  seasonInSpell: number;
  /** The last season the club won it before, in this game; null when it never had. */
  lastWon: number | null;
  /** Where the drought count starts: the last title, or the game's first season when there was none. */
  droughtFrom: number;
  /** Finals the club lost with him. */
  lostFinals: { season: number; competition: CompetitionKey }[];
  /** League seasons the club finished second with him. */
  runnerUps: number[];
  /** The derby rival beaten in the final, or the one left second in the league; null when no rival stood there. */
  rivalId: string | null;
  /** Whether the fans already had him as an idol. */
  wasIdol: boolean;
  /** His titles anywhere, this one counted. */
  careerTitles: number;
  /** Players who were in his first squad at the club and are still there, up to four. */
  veterans: string[];
  /** The final or the match that won it, when the album kept it. */
  decider: { homeId: string; awayId: string; homeGoals: number; awayGoals: number } | null;
};

/** A player's achievement the game celebrates for his coach. */
export type AwardKind = "bolaDeOuro" | "ballonDor" | "topScorer" | "worldCup";

/** A departure that was not a firing: a resignation, a contract run out, or a move to another club. */
export type QuietHow = "resigned" | "contractEnded" | "moved";

type Base = { id: string; date: IsoDate; clubId: string };

/**
 * A big moment of a human coach's career, with its cause in the game as it stood that day. The screens
 * read its numbers; names and colours come from the game when it is shown.
 */
export type Moment =
  | (Base & { kind: "idol"; ledger: IdolEntry[]; standing: number })
  | (Base & {
      kind: "sacking";
      position: number;
      targetPosition: number;
      run: PressureMark[];
      ultimatumOn: IsoDate | null;
      protestOn: IsoDate | null;
      standing: number;
      games: Tally;
      months: number;
      rivalId: string | null;
    })
  | (Base & { kind: "sendOff"; months: number; games: Tally; titles: CompetitionKey[]; standing: number; derbyWins: number; rivalId: string | null; toClubId: string | null })
  | (Base & { kind: "quietExit"; how: QuietHow; months: number; games: Tally; titles: number; toClubId: string | null })
  | (Base & { kind: "title"; competition: CompetitionKey; season: number; seconds: number; story: TitleStory })
  | (Base & { kind: "milestone"; milestone: "games" | "years"; count: number; games: Tally; titles: number; standing: number })
  | (Base & { kind: "homecoming"; opponentId: string; goalsFor: number; goalsAgainst: number; months: number; titles: number; standing: number })
  | (Base & { kind: "idolRetired"; playerId: string; name: string; apps: number; goals: number })
  | (Base & { kind: "testimonial"; playerId: string; name: string; homeId: string; awayId: string; homeGoals: number; awayGoals: number; apps: number; goals: number })
  | (Base & { kind: "comeBack"; standing: number; position: number | null; tableSize: number | null; successor: string | null; ppg: { yours: number; theirs: number } | null })
  | (Base & { kind: "playerAward"; award: AwardKind; players: { playerId: string; name: string; apps: number; goals: number }[]; season: number })
  | (Base & { kind: "retirement" });

export type MomentKind = Moment["kind"];

/**
 * What the moments engine keeps per human coach: the moments waiting to be shown (oldest first) and the
 * day the last one was, what it has already seen of his record, the clubs whose fans made him an idol,
 * his games per club, the pressure of his last matches at his club, and what it already told.
 */
export type CareerMoments = {
  queue: Moment[];
  shownOn: IsoDate | null;
  /** The moments already shown, oldest first, which the trajectory replays. */
  past: Moment[];
  seen: { closedStints: number; trophies: number };
  idolOf: string[];
  games: Record<string, Tally>;
  pressure: PressureMark[];
  ultimatumOn: IsoDate | null;
  protestOn: IsoDate | null;
  /** Milestones already celebrated, as `kind:club:count`. */
  milestones: string[];
  /** Per former club, the last season the papers compared his successor with him. */
  compared: Record<string, number>;
  /** Per former club, the last season it paid him tribute as the visitor. */
  homecomings: Record<string, number>;
  /** The farewell matches booked for his idols, by player. */
  farewells: Record<string, string>;
};

/** The id of the moment a departure from `clubId` on `date` brings: the night sacking, the send-off or the quiet note. */
export const departureMomentId = (left: NonNullable<CoachStint["left"]>, clubId: string, date: IsoDate): string => `${left}:${clubId}:${date}`;

/** The coach's moments as his record keeps them; a record from before moments has none. */
export const careerMomentsOf = (record: Pick<CoachRecord, "moments">): CareerMoments | null => record.moments ?? null;

/**
 * The moment the screen shows next: the oldest waiting, but never two on the same day, so a day that
 * brought several shows one now and the rest on the days after.
 */
export function nextMoment(record: Pick<CoachRecord, "moments">, date: IsoDate): Moment | null {
  const moments = record.moments;
  if (!moments || moments.shownOn === date) return null;
  return moments.queue[0] ?? null;
}

/** The record with a waiting moment (`id`, the next one when left out) seen through on `date`: off the queue and into the trajectory. */
export function closeMoment(record: CoachRecord, date: IsoDate, id?: string): CoachRecord {
  const moments = record.moments;
  const shown = id === undefined ? moments?.queue[0] : moments?.queue.find((moment) => moment.id === id);
  if (!moments || !shown) return record;
  return { ...record, moments: { ...moments, queue: moments.queue.filter((moment) => moment !== shown), shownOn: date, past: [...moments.past, shown] } };
}
