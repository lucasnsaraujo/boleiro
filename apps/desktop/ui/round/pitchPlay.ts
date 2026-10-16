import { FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import { FULL_TIME, HALF_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";
import type { PitchAction, SetPiece } from "./pitchActions.js";

/**
 * The live pitch's play, as a pure function of the presentation clock.
 *
 * Real (the pitch actions): every goal, missed penalty, card, injury and substitution at its minute and for its
 * side, the half-time swap of ends, red cards taking a player off. Presentation only: the passes, the build-up
 * before a real action, and the made-up chances between them, which always end wide or in the keeper's hands and
 * carry no name.
 *
 * Pitch space: `x` 0 → 1 from the left goal line to the right one, `y` 0 → 1 from the far touchline to the
 * near one, `h` the ball's height in pitch lengths.
 */

type BallKind = "roll" | "air" | "shot";
type BallShape = "kickoff" | "celebrate" | "deadBall";
type BallKey = { t: number; x: number; y: number; h: number; kind: BallKind; side: Side | null; shape?: BallShape };
type BeatKind = "shot" | "save" | "wide" | "goal" | "yellow" | "red" | "injury" | "substitution";
/** A moment of the play: where it happened and, for a real action, the tag its player carries and who he is. */
export type Beat = { t: number; kind: BeatKind; side: Side; x: number; y: number; tag: string | null; playerId: string | null };
export type Script = { keys: BallKey[]; beats: Beat[]; msPerMinute: number };
type Ball = { x: number; y: number; h: number; kind: BallKind; side: Side | null; shape: BallShape | undefined; nextAt: { x: number; y: number; t: number } | null };
export type Token = { id: string; side: Side; isKeeper: boolean; x: number; y: number };
/** Each side's formation and the players sent off so far, in the order they went. */
export type Lineups = Record<Side, { formation: Formation; sentOff: readonly string[] }>;

// Durations at 1x; faster clocks shorten them, down to PACE_FLOOR of their length.
const ONE_X_MS_PER_MINUTE = 660;
const PACE_FLOOR = 0.35;
const ATTACK_MS = 2600;
const SHOT_MS = 380;
const CELEBRATE_MS = 1500;
const KICKOFF_MS = 700;
const DEAD_BALL_MS = 760;
const CHANCE_EVERY_MS = 5200;
// The shortest run-up a real action gets when the one before it leaves little room.
const MIN_ATTACK_MS = 420;
// First-half stoppage time is minute 45: the sides change ends half-way into it, before the second half's kick-off.
const SECOND_HALF_MINUTE = HALF_TIME + 0.5;
const POST = 0.054;
const OUTFIELD = 10;
const PITCH_LENGTH_M = 105;
const SPOT_ALONG = 1 - 11 / PITCH_LENGTH_M;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const other = (side: Side): Side => (side === "home" ? "away" : "home");

/** The goal a side attacks at a minute: home attacks the right goal in the first half. */
function attackDirection(side: Side, minute: number): 1 | -1 {
  const isFirstHalf = minute < SECOND_HALF_MINUTE;
  return (side === "home") === isFirstHalf ? 1 : -1;
}

type Strike = { outcome: "goal" | "save" | "wide"; tag: string | null; playerId: string | null; setPiece: SetPiece | null };
type Anchor = { t: number; kind: "strike"; side: Side; strike: Strike } | { t: number; kind: "halfTime" };

/** A match's ball and its beats, laid out over presentation milliseconds at the clock's current speed. */
export function playScript(actions: readonly PitchAction[], fixtureId: string, msPerMinute: number): Script {
  const random = mulberry(hashOf(fixtureId));
  const pace = clamp(msPerMinute / ONE_X_MS_PER_MINUTE, PACE_FLOOR, 1);
  const ms = (oneX: number) => oneX * pace;
  const first: BallKey = { t: 0, x: 0.5, y: 0.5, h: 0, kind: "roll", side: "home", shape: "kickoff" };
  const keys: BallKey[] = [first];
  const beats: Beat[] = [];
  const minuteAt = (t: number) => t / msPerMinute;
  const last = () => keys[keys.length - 1] ?? first;
  let lastChanceAt = 0;

  const push = (key: BallKey) => {
    if (key.t > last().t) keys.push(key);
  };
  const beat = (t: number, kind: BeatKind, side: Side, x: number, y: number, strike?: Strike) =>
    beats.push({ t, kind, side, x, y, tag: strike?.tag ?? null, playerId: strike?.playerId ?? null });

  /** Short passes in the middle, then the other side wins it back. */
  function circulate(from: number, to: number) {
    let t = from;
    let side = last().side ?? "home";
    while (to - t > ms(500)) {
      const span = Math.min(to - t, ms(1700 + random() * 1500));
      const passes = Math.max(1, Math.round(span / ms(520 + random() * 260)));
      const dir = attackDirection(side, minuteAt(t));
      for (let i = 1; i <= passes; i++) {
        const prev = last();
        const along = clamp((dir > 0 ? prev.x : 1 - prev.x) + (random() - 0.4) * 0.28, 0.18, 0.74);
        const air = random() < 0.16;
        const across = prev.y + (random() < 0.5 ? -1 : 1) * (0.14 + random() * 0.3);
        push({ t: t + (span * i) / passes, x: dir > 0 ? along : 1 - along, y: clamp(across, 0.08, 0.92), h: 0, kind: air ? "air" : "roll", side });
      }
      t += span;
      side = other(side);
      const prev = last();
      push({ t: t + ms(160), x: clamp(prev.x + (random() - 0.5) * 0.04, 0.05, 0.95), y: clamp(prev.y + (random() - 0.5) * 0.06, 0.06, 0.94), h: 0, kind: "roll", side });
      t += ms(160);
    }
  }

  /** Where a dead ball is struck from, along the attack and across. */
  function deadBallSpot(setPiece: SetPiece): { along: number; y: number } {
    if (setPiece === "penalty") return { along: SPOT_ALONG, y: 0.5 };
    if (setPiece === "corner") return { along: 1, y: random() < 0.5 ? 0 : 1 };
    return { along: 0.72 + random() * 0.05, y: 0.28 + random() * 0.44 };
  }

  /** Passes forward to a shooting spot, or the ball set down for a set piece, then the strike and where it ends, cut short at `until`. */
  function attack(side: Side, from: number, at: number, strike: Strike, until = Infinity) {
    const after = (key: BallKey) => {
      if (key.t < until) push(key);
    };
    const dir = attackDirection(side, minuteAt(at));
    const goalX = dir > 0 ? 1 : 0;
    const toX = (along: number) => (dir > 0 ? along : 1 - along);
    const { outcome, setPiece } = strike;
    const isCross = !setPiece && random() < 0.38;
    const launch = at - ms(SHOT_MS);
    const dead = setPiece ? deadBallSpot(setPiece) : null;
    const shootFrom = dead ?? (isCross ? { along: 0.92 + random() * 0.03, y: 0.44 + random() * 0.12 } : { along: 0.8 + random() * 0.07, y: 0.3 + random() * 0.4 });
    const prev = last();
    push({ t: from + ms(80), x: prev.x, y: prev.y, h: 0, kind: "roll", side });
    const buildEnd = dead ? launch - ms(DEAD_BALL_MS) - ms(120) : isCross ? launch - ms(520) : launch - ms(90);
    const startAlong = dir > 0 ? prev.x : 1 - prev.x;
    const passes = Math.max(2, Math.round((buildEnd - from) / ms(560)));
    const wing = random() < 0.5 ? 0.09 : 0.91;
    const buildTo = dead ? { along: Math.min(dead.along, 0.86) - 0.04, y: clamp(dead.y, 0.2, 0.8) } : { along: isCross ? 0.88 : shootFrom.along - 0.04, y: shootFrom.y };
    for (let i = 1; i <= passes; i++) {
      const u = i / passes;
      const along = lerp(startAlong, buildTo.along, u * u * (3 - 2 * u));
      const y = isCross ? lerp(prev.y, wing, u) + (random() - 0.5) * 0.08 * (1 - u) : lerp(prev.y, buildTo.y, u) + (random() - 0.5) * 0.22 * (1 - u);
      push({ t: lerp(from + ms(80), buildEnd, u), x: toX(along), y: clamp(y, 0.06, 0.94), h: 0, kind: "roll", side });
    }
    if (dead) {
      // The ball is set down and the taker stands over it: still until the strike.
      push({ t: launch - ms(DEAD_BALL_MS), x: toX(dead.along), y: dead.y, h: 0, kind: "roll", side, shape: "deadBall" });
      push({ t: launch, x: toX(dead.along), y: dead.y, h: 0, kind: "roll", side, shape: "deadBall" });
    } else if (isCross) push({ t: launch - ms(40), x: toX(shootFrom.along), y: shootFrom.y, h: 0.012, kind: "air", side });
    else push({ t: launch, x: toX(shootFrom.along + 0.012), y: shootFrom.y, h: 0, kind: "roll", side });
    const shotY = outcome === "wide" ? 0.5 + (random() < 0.5 ? -1 : 1) * (POST + 0.02 + random() * 0.04) : 0.5 + (random() - 0.5) * POST * 1.3;
    // Free kicks and corners curl in over the wall; everything else is struck low and hard.
    const strikeKind: BallKind = setPiece === "freeKick" || setPiece === "corner" ? "air" : "shot";
    beat(launch, "shot", side, goalX, shotY, strike);
    if (outcome === "goal") {
      push({ t: at, x: goalX, y: shotY, h: 0.01 + random() * 0.012, kind: strikeKind, side });
      after({ t: at + ms(140), x: goalX + dir * 0.024, y: shotY + (shotY - 0.5) * 0.15, h: 0.006, kind: "roll", side });
      after({ t: at + ms(420), x: goalX + dir * 0.02, y: shotY, h: 0, kind: "roll", side, shape: "celebrate" });
      beat(at, "goal", side, goalX, shotY, strike);
    } else if (outcome === "save") {
      push({ t: at, x: goalX - dir * 0.012, y: shotY, h: 0.008 + random() * 0.01, kind: strikeKind, side });
      after({ t: at + ms(420), x: goalX - dir * (0.08 + random() * 0.05), y: clamp(shotY + (random() < 0.5 ? -1 : 1) * (0.14 + random() * 0.1), 0.08, 0.92), h: 0, kind: "air", side: other(side) });
      beat(at, "save", side, goalX, shotY, strike);
    } else {
      push({ t: at, x: goalX + dir * 0.012, y: shotY, h: 0.02 + random() * 0.02, kind: strikeKind, side });
      after({ t: at + ms(260), x: goalX + dir * 0.032, y: shotY + (shotY - 0.5) * 0.4, h: 0, kind: "roll", side });
      beat(at, "wide", side, goalX, shotY, strike);
      after({ t: at + ms(1100), x: goalX - dir * 0.05, y: 0.5, h: 0, kind: "roll", side: other(side) });
    }
    lastChanceAt = at;
  }

  /** Short passes and, every few seconds, a made-up chance that comes to nothing. */
  function fill(from: number, to: number) {
    let t = from;
    while (to - t > ms(400)) {
      const isChanceDue = t - lastChanceAt > ms(CHANCE_EVERY_MS) * (0.7 + random() * 0.6) && to - t > ms(ATTACK_MS) + ms(600);
      if (isChanceDue) {
        const side = last().side ?? "home";
        const end = t + ms(ATTACK_MS) * (0.8 + random() * 0.3);
        attack(side, t, end, { outcome: random() < 0.5 ? "save" : "wide", tag: null, playerId: null, setPiece: null });
        t = last().t + ms(200);
        continue;
      }
      const span = Math.min(to - t, ms(2200 + random() * 1800));
      circulate(t, t + span);
      t += span;
    }
  }

  function kickOff(at: number, side: Side) {
    push({ t: at - ms(KICKOFF_MS) * 0.3, x: 0.5, y: 0.5, h: 0, kind: "roll", side, shape: "kickoff" });
    push({ t: at, x: 0.5, y: 0.5, h: 0, kind: "roll", side, shape: "kickoff" });
  }

  const anchors: Anchor[] = actions
    .flatMap((action): Anchor[] => {
      const t = action.minute * msPerMinute;
      if (action.kind === "halfTime") return [{ t, kind: "halfTime" }];
      if (action.kind === "goal") return [{ t, kind: "strike", side: action.side, strike: { outcome: "goal", tag: action.tag, playerId: action.playerId, setPiece: action.setPiece } }];
      if (action.kind === "chance") {
        const outcome = action.outcome === "saved" ? "save" : "wide";
        return [{ t, kind: "strike", side: action.side, strike: { outcome, tag: action.tag, playerId: action.playerId, setPiece: action.setPiece } }];
      }
      return [];
    })
    .sort((a, b) => a.t - b.t);

  let cursor = ms(KICKOFF_MS);
  anchors.forEach((anchor, index) => {
    // A real action never runs into the next one: whatever follows it is cut short to leave the next its run-up.
    const next = anchors[index + 1];
    const until = next ? next.t - ms(MIN_ATTACK_MS) : Infinity;
    if (anchor.kind === "halfTime") {
      fill(cursor, anchor.t - ms(KICKOFF_MS));
      kickOff(Math.min(Math.max(anchor.t + ms(KICKOFF_MS) * 0.5, SECOND_HALF_MINUTE * msPerMinute + ms(KICKOFF_MS) * 0.3), until), "away");
      cursor = Math.max(cursor, Math.min(anchor.t + ms(KICKOFF_MS), until));
      return;
    }
    const start = Math.min(Math.max(cursor, anchor.t - ms(ATTACK_MS)), anchor.t - ms(MIN_ATTACK_MS));
    fill(cursor, start);
    attack(anchor.side, Math.max(start, last().t), anchor.t, anchor.strike, until);
    if (anchor.strike.outcome !== "goal") {
      cursor = Math.min(last().t + ms(200), until);
      return;
    }
    const restart = Math.min(anchor.t + ms(CELEBRATE_MS), until - ms(KICKOFF_MS));
    kickOff(restart + ms(KICKOFF_MS), other(anchor.side));
    cursor = restart + ms(KICKOFF_MS);
  });
  fill(cursor, FULL_TIME * msPerMinute);

  for (const action of actions) {
    if (action.kind !== "card" && action.kind !== "injury" && action.kind !== "substitution") continue;
    const kind: BeatKind = action.kind === "card" ? action.card : action.kind;
    beats.push({ t: action.minute * msPerMinute, kind, side: action.side, x: 0, y: 0, tag: action.tag, playerId: action.playerId });
  }
  beats.sort((a, b) => a.t - b.t);
  return { keys, beats, msPerMinute };
}

const easeOut = (u: number) => 1 - (1 - u) ** 3;

/** Where the ball is at presentation time `t`, rolling, in the air on a parabola, or struck flat and fast. */
export function ballAt({ keys }: Script, t: number): Ball {
  let i = 0;
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((keys[mid]?.t ?? 0) <= t) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const a = keys[i];
  const b = keys[i + 1];
  if (!a) return { x: 0.5, y: 0.5, h: 0, kind: "roll", side: null, shape: "kickoff", nextAt: null };
  if (!b) return { x: a.x, y: a.y, h: a.h, kind: a.kind, side: a.side, shape: a.shape, nextAt: null };
  const u = clamp((t - a.t) / (b.t - a.t), 0, 1);
  const eased = b.kind === "roll" ? easeOut(u) : b.kind === "shot" ? 1 - (1 - u) ** 1.6 : u;
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const peak = b.kind === "air" ? 0.03 + span * 0.18 : b.kind === "shot" ? span * 0.05 : 0;
  return {
    x: lerp(a.x, b.x, eased),
    y: lerp(a.y, b.y, eased),
    h: lerp(a.h, b.h, eased) + peak * 4 * u * (1 - u),
    kind: b.kind,
    side: a.side,
    shape: a.shape,
    nextAt: { x: b.x, y: b.y, t: b.t },
  };
}

/** The beats that fall in (from, to]. */
export function beatsBetween({ beats }: Script, from: number, to: number): Beat[] {
  return beats.filter((b) => b.t > from && b.t <= to);
}

/** The last strike beat (shot, save, wide, goal) at or before `t`, if it was no more than `within` ms ago. */
export function strikeNear({ beats }: Script, t: number, within: number): Beat | null {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (!b || b.t > t || (b.kind !== "shot" && b.kind !== "save" && b.kind !== "wide" && b.kind !== "goal")) continue;
    return t - b.t <= within ? b : null;
  }
  return null;
}

/** Every player's spot at presentation time `t`: the side's shape shifted toward the ball, the nearest players to it pressing or receiving. */
export function tokensAt(script: Script, t: number, lineups: Lineups): Token[] {
  const ball = ballAt(script, t);
  const minute = t / script.msPerMinute;
  const tokens: Token[] = [];
  const possession = ball.side;
  const recent = strikeNear(script, t, 900);
  for (const side of ["home", "away"] as const) {
    const dir = attackDirection(side, minute);
    const ballAlong = dir > 0 ? ball.x : 1 - ball.x;
    const hasBall = possession === side;
    const slots = FORMATIONS[lineups[side].formation];
    const gone = new Set(sentOffSlots(lineups[side].sentOff).values());
    slots.forEach((slot, index) => {
      if (gone.has(index)) return;
      const depth = (100 - slot.y) / 100;
      const lane = slot.x / 100;
      const id = `${side}-${index}`;
      const sway = Math.sin(t / 900 + index * 1.7 + (side === "home" ? 0 : 2)) * 0.008;
      let along: number;
      let y: number;
      if (index === 0) {
        const dive = recent && (recent.kind === "save" || recent.kind === "goal") && recent.side !== side ? (recent.y - 0.5) * 0.9 : 0;
        along = 0.03 + clamp((ballAlong - 0.5) * 0.05, -0.012, 0.025);
        y = 0.5 + clamp((ball.y - 0.5) * 0.2, -0.045, 0.045) + dive;
      } else if (ball.shape === "kickoff") {
        along = 0.06 + depth * 0.4;
        y = lane;
      } else if (ball.shape === "celebrate") {
        const scored = recent?.kind === "goal" ? recent.side : ball.side;
        if (scored === side && depth > 0.45) {
          // The front men run to the corner flag and fan out around it.
          const corner = ball.y < 0.5 ? 0.04 : 0.96;
          const angle = (index / slots.length) * Math.PI * 0.9 + 0.2;
          along = 0.93 - Math.sin(angle) * 0.075;
          y = corner + (corner < 0.5 ? 1 : -1) * Math.cos(angle) * 0.07 + (corner < 0.5 ? 0.06 : -0.06);
        } else if (scored === side) {
          along = 0.5 + depth * 0.3;
          y = lane;
        } else {
          along = 0.12 + depth * 0.3;
          y = lane + (0.5 - lane) * 0.2;
        }
      } else {
        along = 0.05 + depth * 0.46 + (hasBall ? 0.1 : 0) + (ballAlong - 0.45) * 0.52;
        y = lane + (ball.y - lane) * 0.16 + sway;
      }
      along = clamp(along, 0.02, 0.97);
      tokens.push({ id, side, isKeeper: index === 0, x: dir > 0 ? along : 1 - along, y: clamp(y, 0.03, 0.97) });
    });
  }
  if (ball.shape === "kickoff" || ball.shape === "celebrate") return tokens;
  // The holder meets the ball, the receiver runs onto the next pass, and the nearest opponent presses.
  const nearest = (side: Side, x: number, y: number, except?: Token) =>
    tokens.filter((p) => p.side === side && !p.isKeeper && p !== except).reduce<Token | null>((best, p) => (!best || Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best), null);
  if (possession) {
    const holder = nearest(possession, ball.x, ball.y);
    const dir = attackDirection(possession, minute);
    if (holder) {
      holder.x = ball.x - dir * 0.012;
      holder.y = ball.y;
    }
    if (ball.nextAt && ball.nextAt.t - t < 900 && ball.shape !== "deadBall") {
      const receiver = nearest(possession, ball.nextAt.x, ball.nextAt.y, holder ?? undefined);
      if (receiver) {
        receiver.x = ball.nextAt.x - dir * 0.01;
        receiver.y = ball.nextAt.y;
      }
    }
    // Over a dead ball the defenders stand off; in play the nearest one presses.
    const presser = nearest(other(possession), ball.x, ball.y);
    if (presser) {
      const gap = ball.shape === "deadBall" ? 0.09 : 0.03;
      presser.x = ball.x + dir * gap;
      presser.y = ball.y + (ball.y < 0.5 ? 0.025 : -0.025);
    }
  }
  return tokens;
}

/** The outfield slot each sent-off player stood in: his own by his id, or the next one along when a team-mate sent off before him holds it. */
function sentOffSlots(sentOff: readonly string[]): Map<string, number> {
  const slots = new Map<string, number>();
  const taken = new Set<number>();
  for (const playerId of sentOff) {
    let slot = 1 + (hashOf(playerId) % OUTFIELD);
    for (let i = 0; i < OUTFIELD && taken.has(slot); i++) slot = 1 + (slot % OUTFIELD);
    slots.set(playerId, slot);
    taken.add(slot);
  }
  return slots;
}

/**
 * The token a player's real actions show on, picked by his id so the same player keeps the same token: a sent-off
 * player keeps his, and anyone whose token went with a sent-off team-mate gets the next one still on the pitch.
 */
export function tokenIdOf(side: Side, playerId: string, sentOff: readonly string[]): string {
  const slots = sentOffSlots(sentOff);
  const own = slots.get(playerId);
  if (own !== undefined) return `${side}-${own}`;
  const gone = new Set(slots.values());
  let slot = 1 + (hashOf(playerId) % OUTFIELD);
  for (let i = 0; i < OUTFIELD && gone.has(slot); i++) slot = 1 + (slot % OUTFIELD);
  return `${side}-${slot}`;
}
