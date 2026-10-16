import type { PositionGroup } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import type { SimPlayer } from "../gameState.js";
import { drawMinute, goalMinuteWeights, inMatchOrder, type MatchEvent } from "../live/matchTimeline.js";
import type { MatchOfficials, VarStyle } from "./matchOfficials.js";

/** What VAR decided after a check: the call on the pitch stands, or is changed. */
export type VarDecision = "goalStands" | "goalRuledOut" | "goalAwarded" | "penaltyAwarded" | "penaltyCancelled" | "redCardGiven" | "redCardCancelled";

/**
 * A VAR check: `playerId` (of `clubId`) is the scorer, the penalty's taker or the player fouled, or
 * the one shown red; `seconds` is how long the match stood still.
 */
export type VarCheck = { type: "varCheck"; minute: number; clubId: string; playerId: string; decision: VarDecision; seconds: number };

/** A call the referee got wrong that nobody put right. */
export type WrongCallKind = "goalShouldNotStand" | "goalWronglyRuledOut" | "penaltyWronglyGiven" | "penaltyNotGiven" | "redCardWronglyGiven" | "redCardNotGiven";

/** A wrong call: `playerId` (of `clubId`) is the player in it, `againstId` the side it cost. */
type WrongCall = { type: "wrongCall"; minute: number; clubId: string; playerId: string; call: WrongCallKind; againstId: string };

export type RefereeCall = VarCheck | WrongCall;

/**
 * A call the day's papers and dressing rooms talk about: VAR changing a decision, or a wrong call
 * that stood, in a match of the day, with its referee (null where the data names none).
 */
export type RefereeCallEvent = { type: "refereeCall"; fixtureId: string; competitionId: string; referee: string | null; call: RefereeCall };

/** "1 min 40 s", "48 s": how long a VAR check stopped the match. */
export function reviewLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`;
}

/** The calls of a match worth talking about: every wrong call that stood and every VAR check that changed a decision. */
export function talkedAboutCalls(events: readonly MatchEvent[]): RefereeCall[] {
  return events.filter((e): e is RefereeCall => e.type === "wrongCall" || (e.type === "varCheck" && e.decision !== "goalStands"));
}

/** One side of a match as the referee sees it: who is on the pitch at each minute. */
type CallSide = { clubId: string; onPitch: (minute: number) => readonly SimPlayer[] };

type Eligible = "goal" | "penalty" | "straightRed";

/**
 * A kind of refereeing error, at its rate per match in Série A. A caught error is put right by VAR; a
 * missed one (no VAR, or VAR misses it) stands. Each kind leaves the drawn match one way and adds
 * an event of its own the other: a goal that should not stand is in the score when missed, a ruled-out
 * goal (not in it) when caught; a penalty not given is a drawn penalty when caught, a claim waved
 * away when missed.
 */
type ErrorKind = {
  /** How often the error happens per match, before VAR. */
  rate: number;
  /** Which drawn events the error can sit on. */
  on: Eligible;
  /** When the error leaves the drawn event as it is and adds one of its own. */
  addsWhen: "caught" | "missed";
  caught: VarDecision;
  missed: WrongCallKind;
  /** Whose player the added event names: the attacking side's (scorer, player fouled) or the defending side's (red card). */
  addsFor: "attacking" | "defending";
};

// The 2025 Série A had 192 VAR corrections in 380 matches, 0.505 a match (Estadão/ge via Diário de
// Pernambuco, 10 Dec 2025). FotMob's logged overturns (299 Série A matches, 13 Oct 2026, research
// immersion-sources §6) split: 42 goals ruled out, 12 penalties cancelled, 7 red cards removed in 61,
// 0.20 a match. guess: the other 0.305 (decisions VAR made but FotMob does not log) are 0.12 goals
// given after a wrong flag, 0.12 penalties given and 0.065 red cards given. guess: VAR misses one
// error in seven, as the Premier League's panel counted (13 VAR errors against 47 overturns at
// mid-season 2025/26, Inside World Football), so the referee errs 0.505 / (6/7) a match.
const CAUGHT_SHARE = 6 / 7;
const LOGGED = 0.2 / 61;
const KINDS: readonly ErrorKind[] = (
  [
  { rate: 42 * LOGGED, on: "goal", addsWhen: "caught", caught: "goalRuledOut", missed: "goalShouldNotStand", addsFor: "attacking" },
  { rate: 0.12, on: "goal", addsWhen: "missed", caught: "goalAwarded", missed: "goalWronglyRuledOut", addsFor: "attacking" },
  { rate: 12 * LOGGED, on: "penalty", addsWhen: "caught", caught: "penaltyCancelled", missed: "penaltyWronglyGiven", addsFor: "attacking" },
  { rate: 0.12, on: "penalty", addsWhen: "missed", caught: "penaltyAwarded", missed: "penaltyNotGiven", addsFor: "attacking" },
  { rate: 7 * LOGGED, on: "straightRed", addsWhen: "caught", caught: "redCardCancelled", missed: "redCardWronglyGiven", addsFor: "defending" },
  { rate: 0.065, on: "straightRed", addsWhen: "missed", caught: "redCardGiven", missed: "redCardNotGiven", addsFor: "defending" },
  ] satisfies ErrorKind[]
).map((kind) => ({ ...kind, rate: kind.rate / CAUGHT_SHARE }));

// Série A per match: 2.49 goals (1,889 in 760 matches), 0.279 penalties (212 in 760; ESPN, see
// match.ts) and 0.18 straight red cards (0.296 reds a match, 87 of 225 of them second yellows; cardRates.ts).
const PER_MATCH: Record<Eligible, number> = { goal: 1889 / 760, penalty: 212 / 760, straightRed: 0.296 * (1 - 87 / 225) };

// Brazil's VAR took about 1 min 40 s per intervention in 2025 (Estadão/ge via Diário de Pernambuco).
// The Premier League made 47 overturns in its first 190 matches of 2025/26 (0.25 a match against
// Brazil's 0.505) and stopped about 48 s each (Inside World Football, 14 Jan 2026). guess: Europe's
// referees err less in the same proportion, VAR catching the same share.
const STYLE: Record<VarStyle, { errors: number; seconds: number }> = {
  brazil: { errors: 1, seconds: 100 },
  europe: { errors: 0.25 / 0.505, seconds: 48 },
};
// guess: where no VAR watches, referees err at Brazil's rate.
const WITHOUT_VAR = STYLE.brazil;
// guess: VAR is seen checking one goal in ten that stands, for about a minute.
const GOAL_CHECK_SHARE = 0.1;
const GOAL_CHECK_SECONDS = 60;
// guess: who gets the ball in the net or goes down in the box, by position.
const ATTACKER_WEIGHT: Record<PositionGroup, number> = { GK: 0, DEF: 1, MID: 2, ATT: 4 };
const DEFENDER_WEIGHT: Record<PositionGroup, number> = { GK: 0, DEF: 3, MID: 2, ATT: 1 };

const ADDED_STREAM_SALT = 0x3a71;
const ON_EVENT_STREAM_SALT = 0x3a72;
const ELEVEN_A_SIDE = goalMinuteWeights([], [], 0);

function poisson(mean: number, random: () => number): number {
  let roll = random();
  let p = Math.exp(-mean);
  let n = 0;
  while (roll > p && n < 10) {
    roll -= p;
    n++;
    p *= mean / n;
  }
  return n;
}

function pick(players: readonly SimPlayer[], weights: Record<PositionGroup, number>, roll: number): SimPlayer | undefined {
  const total = players.reduce((sum, p) => sum + weights[p.group], 0);
  let left = roll * total;
  return total > 0 ? (players.find((p) => (left -= weights[p.group]) < 0) ?? players[players.length - 1]) : undefined;
}

const isCall = (e: MatchEvent): e is RefereeCall => e.type === "varCheck" || e.type === "wrongCall";

function eligibleAs(e: MatchEvent): Eligible | null {
  if (e.type === "goal") return e.kind === "penalty" ? "penalty" : e.kind === "ownGoal" ? null : "goal";
  if (e.type === "penaltyMiss") return "penalty";
  if (e.type === "card" && e.card === "red") return "straightRed";
  return null;
}

type CallMatch = { seed: number; fixtureId: string; officials: MatchOfficials; home: CallSide; away: CallSide };

/**
 * A match's timeline with its referee's calls: the VAR checks where VAR watches, and the wrong calls
 * that stand. Calls only tell how the match went; they never change its score, cards or players, so
 * goals and results stay as calibrated. Every call draws from streams keyed by the fixture, and a
 * call on an event by the event too: a timeline redrawn from a minute keeps every call before it.
 * Calls already in `events` are dropped and told again.
 */
export function withRefereeCalls(events: readonly MatchEvent[], match: CallMatch): MatchEvent[] {
  const played = events.filter((e) => !isCall(e));
  const style = match.officials.var;
  const errors = (style ? STYLE[style] : WITHOUT_VAR).errors;
  const seconds = style ? STYLE[style].seconds : 0;
  const otherOf = (clubId: string) => (clubId === match.home.clubId ? match.away : match.home);
  const calls: RefereeCall[] = [];
  const call = (caught: boolean, decision: VarDecision, missed: WrongCallKind, at: { minute: number; clubId: string; playerId: string; againstId: string }, checkSeconds = seconds) => {
    const { minute, clubId, playerId, againstId } = at;
    calls.push(caught ? { type: "varCheck", minute, clubId, playerId, decision, seconds: checkSeconds } : { type: "wrongCall", minute, clubId, playerId, call: missed, againstId });
  };

  const added = keyedStream(match.seed ^ ADDED_STREAM_SALT, match.fixtureId);
  for (const kind of KINDS) {
    const share = kind.addsWhen === "caught" ? (style ? CAUGHT_SHARE : 0) : style ? 1 - CAUGHT_SHARE : 1;
    const count = poisson(kind.rate * errors * share, added);
    for (let i = 0; i < count; i++) {
      const minute = drawMinute(ELEVEN_A_SIDE, added);
      const attacking = added() < 0.5 ? match.home : match.away;
      const named = kind.addsFor === "attacking" ? attacking : otherOf(attacking.clubId);
      const player = pick(named.onPitch(minute), kind.addsFor === "attacking" ? ATTACKER_WEIGHT : DEFENDER_WEIGHT, added());
      if (!player) continue;
      // A missed error costs the attacking side: its goal or penalty taken away, or a foul on it left unpunished.
      call(kind.addsWhen === "caught", kind.caught, kind.missed, { minute, clubId: named.clubId, playerId: player.id, againstId: attacking.clubId });
    }
  }

  for (const e of played) {
    const on = eligibleAs(e);
    if (!on || !("playerId" in e)) continue;
    const roll = keyedStream(match.seed ^ ON_EVENT_STREAM_SALT, `${match.fixtureId}/${e.type}/${e.minute}/${e.playerId}`)();
    let left = roll;
    const hit = KINDS.find((kind) => {
      if (kind.on !== on) return false;
      const share = kind.addsWhen === "caught" ? (style ? 1 - CAUGHT_SHARE : 1) : style ? CAUGHT_SHARE : 0;
      return (left -= (kind.rate * errors * share) / PER_MATCH[on]) < 0;
    });
    const clubId = e.clubId;
    // A goal or penalty costs the other side; a red card costs the side shown it.
    const againstId = on === "straightRed" ? clubId : otherOf(clubId).clubId;
    if (hit) {
      call(hit.addsWhen === "missed", hit.caught, hit.missed, { minute: e.minute, clubId, playerId: e.playerId, againstId });
      continue;
    }
    // The roll left over is spread evenly over what no error took, so a share of it is a share of the goals.
    const unclaimed = 1 - (roll - left);
    if (style && on === "goal" && left < GOAL_CHECK_SHARE * unclaimed) {
      calls.push({ type: "varCheck", minute: e.minute, clubId, playerId: e.playerId, decision: "goalStands", seconds: GOAL_CHECK_SECONDS });
    }
  }
  return inMatchOrder([...played, ...calls]);
}
