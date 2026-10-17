import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Formation } from "@boleiro/engine/engine/formations";
import { matchEndOf } from "@boleiro/engine/sim/live/matchTimeline";
import type { RoundClub, RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";
import { plateColours } from "../clubs/clubCatalog.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { pitchActionsOf } from "./pitchActions.js";
import { ballAt, beatsBetween, playScript, strikeNear, tokenIdOf, tokensAt, type Beat, type Lineups, type Token } from "./pitchPlay.js";
import "./livePitch.css";

// The board: a pitch with a run-off around it, seen from the near touchline and a little above.
const RUN_X = 0.05;
const RUN_Y = 0.07;
const FAR_SHRINK = 0.8;
const THICKNESS = 7;
const MAX_WIDTH = 660;
// Upright things (posts, the ball in the air) read better a little taller than true scale on a board this flat.
const LIFT = 1.7;
const GOAL_H = 0.0235;
const POST = 0.054;
const NET_DEPTH = 0.024;
const TOKEN_TAU_MS = 210;
const BALL_TAU_MS = 40;
const STRIPES = 12;
// How long a player carries the tag of what he just did, and the most a ball stopped on a goal still travels.
const TAG_MS = 1700;
const OVERRUN_MS = 650;
const TAGGED: ReadonlySet<Beat["kind"]> = new Set(["shot", "yellow", "red", "injury", "substitution"]);

type Geometry = { width: number; height: number; cx: number; near: number; far: number; vFar: number; vNear: number };
type Point = { u: number; v: number; scale: number; depth: number };

function geometryOf(width: number, height: number, maxWidth: number): Geometry {
  const near = Math.min(width - 12, maxWidth);
  return { width, height, cx: width / 2, near, far: near * FAR_SHRINK, vFar: 4, vNear: height - THICKNESS - 9 };
}

/** A pitch point on the screen: the board's perspective, so lines stay straight and circles turn into ellipses. */
function project(g: Geometry, x: number, y: number, h = 0): Point {
  const depth = (y + RUN_Y) / (1 + 2 * RUN_Y);
  const z = (1 / FAR_SHRINK) * (1 - depth) + depth;
  const w = g.near / z;
  const lateral = (x + RUN_X) / (1 + 2 * RUN_X) - 0.5;
  const v = g.vFar + ((g.vNear - g.vFar) * (w - g.far)) / (g.near - g.far);
  const perLength = w / (1 + 2 * RUN_X);
  return { u: g.cx + lateral * w, v: v - h * perLength * LIFT, scale: w / g.near, depth };
}

const pathOf = (g: Geometry, points: readonly (readonly [number, number, number?])[], close = false) =>
  points.map(([x, y, h], i) => `${i ? "L" : "M"}${project(g, x, y, h).u.toFixed(1)} ${project(g, x, y, h).v.toFixed(1)}`).join("") + (close ? "Z" : "");

const ellipse = (cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, steps = 40) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
  });

/** Pitch markings, in metres over 105 × 68. */
function markings(g: Geometry): string {
  const L = 105;
  const W = 68;
  const mx = (m: number) => m / L;
  const my = (m: number) => m / W;
  const box = (end: 0 | 1, depth: number, half: number) => {
    const d = end === 0 ? mx(depth) : 1 - mx(depth);
    return pathOf(g, [
      [end, 0.5 - my(half)],
      [d, 0.5 - my(half)],
      [d, 0.5 + my(half)],
      [end, 0.5 + my(half)],
    ]);
  };
  const arc = (end: 0 | 1) => {
    const spot = end === 0 ? mx(11) : 1 - mx(11);
    const reach = Math.acos(5.5 / 9.15);
    const [from, to] = end === 0 ? [-reach, reach] : [Math.PI - reach, Math.PI + reach];
    return pathOf(g, ellipse(spot, 0.5, mx(9.15), my(9.15), from, to, 16));
  };
  const spot = (x: number, y: number) => pathOf(g, ellipse(x, y, mx(0.35), my(0.35), 0, Math.PI * 2, 10), true);
  return [
    pathOf(g, [[0, 0], [1, 0], [1, 1], [0, 1]], true),
    pathOf(g, [[0.5, 0], [0.5, 1]]),
    pathOf(g, ellipse(0.5, 0.5, mx(9.15), my(9.15)), true),
    box(0, 16.5, 20.16),
    box(1, 16.5, 20.16),
    box(0, 5.5, 9.16),
    box(1, 5.5, 9.16),
    arc(0),
    arc(1),
    spot(0.5, 0.5),
    spot(mx(11), 0.5),
    spot(1 - mx(11), 0.5),
  ].join("");
}

/** One end's goal: the back of the net and the far post under the players, the near post and the bar over them. */
function goalParts(g: Geometry, end: 0 | 1) {
  const back = end === 0 ? -NET_DEPTH : 1 + NET_DEPTH;
  const far = 0.5 - POST;
  const near = 0.5 + POST;
  const H = GOAL_H;
  const netLines: string[] = [];
  for (let i = 1; i < 6; i++) netLines.push(pathOf(g, [[back, far + (i * (near - far)) / 6, 0], [back, far + (i * (near - far)) / 6, H * 0.85]]));
  for (let i = 1; i < 4; i++) netLines.push(pathOf(g, [[back, far, (i * H * 0.85) / 4], [back, near, (i * H * 0.85) / 4]]));
  return {
    backNet: pathOf(g, [[back, far, 0], [back, far, H * 0.85], [back, near, H * 0.85], [back, near, 0]], true),
    roof: pathOf(g, [[end, far, H], [back, far, H * 0.85], [back, near, H * 0.85], [end, near, H]], true),
    sideFar: pathOf(g, [[end, far, H], [back, far, H * 0.85], [back, far, 0], [end, far, 0]], true),
    sideNear: pathOf(g, [[end, near, H], [back, near, H * 0.85], [back, near, 0], [end, near, 0]], true),
    mesh: netLines.join(""),
    farPost: pathOf(g, [[end, far, 0], [end, far, H]]),
    frame: pathOf(g, [[end, far, H], [end, near, H], [end, near, 0]]),
    mouth: project(g, end, 0.5, H * 0.5),
    nearDepth: project(g, end, near).depth,
  };
}

function distance(a: string, b: string): number {
  const rgb = (hex: string) => (hex.replace("#", "").match(/../g) ?? []).map((pair) => parseInt(pair, 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot((x[0] ?? 0) - (y[0] ?? 0), (x[1] ?? 0) - (y[1] ?? 0), (x[2] ?? 0) - (y[2] ?? 0));
}

/** The kits on the board: the away side wears its second colour when the two first colours look alike. */
function kitsOf(home: RoundClub, away: RoundClub): Record<Side, { body: string; ring: string }> {
  const clash = distance(home.colours.primary, away.colours.primary) < 120;
  return {
    home: { body: home.colours.primary, ring: home.colours.secondary },
    away: clash ? { body: away.colours.secondary, ring: away.colours.primary } : { body: away.colours.primary, ring: away.colours.secondary },
  };
}

const KEEPER_KITS = ["#ffcc00", "#1d2521", "#6fc8ff"];

function keeperKit(kits: Record<Side, { body: string }>, side: Side): string {
  const avoid = [kits.home.body, kits.away.body];
  const order = side === "home" ? KEEPER_KITS : [...KEEPER_KITS].reverse();
  return order.find((k) => avoid.every((c) => distance(c, k) > 140)) ?? "#ffcc00";
}

const BEAT_TEXT: Partial<Record<Beat["kind"], string>> = { shot: "Chute", save: "Defesa", wide: "Pra fora", goal: "Gol" };

type Props = {
  match: RoundMatch;
  clubs: Readonly<Record<string, RoundClub>>;
  /** Player names by id, for the tags of what they do. */
  names: Readonly<Record<string, string>>;
  minute: number;
  /** Whether the round's clock is running; the board plays only while it does. */
  isRunning: boolean;
  /** How long a match minute lasts at the clock's speed, or the speed it last ran at while it stands still. */
  msPerMinute: number;
  formations: Record<Side, Formation>;
  /** Labels the board when several coaches play: who coaches it and how it stands. */
  caption?: ReactNode;
  /** A hot-seat board out of focus: no camera lean, no tags. */
  isQuiet?: boolean;
};

/**
 * A match on a little board seen from the side: its real goals, missed penalties, cards, injuries and
 * substitutions at their minute, each tagged with its player's name, and passes, build-ups and made-up chances
 * between them. Moves only by transform and opacity.
 */
export function LivePitch({ match, clubs, names, minute, isRunning, msPerMinute, formations, caption, isQuiet = false }: Props) {
  const tilt = useRef<HTMLDivElement>(null);
  // Two coaches who meet each get a board of the same match: the board's SVG ids must still differ.
  const svgId = `lp-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // The round hands the board a fresh copy of the match every minute; its timeline only changes with the match.
  const actions = useMemo(() => pitchActionsOf(match, names), [match.events, match.play, match.homeId, names]);
  // A match with its players' play has real shots to show; one without gets made-up chances between its events.
  const hasPlay = match.play !== undefined;
  const script = useMemo(() => playScript(actions, match.fixtureId, msPerMinute, { isMakingUpChances: !hasPlay }), [actions, match.fixtureId, msPerMinute, hasPlay]);
  const home = clubs[match.homeId];
  const away = clubs[match.awayId];
  const kits = useMemo(() => (home && away ? kitsOf(home, away) : null), [home, away]);
  const sentOff = (side: Side) => actions.flatMap((a) => (a.kind === "card" && a.card === "red" && a.minute <= minute && a.side === side ? [a.playerId] : []));
  const lineups: Lineups = { home: { formation: formations.home, sentOff: sentOff("home") }, away: { formation: formations.away, sentOff: sentOff("away") } };
  const lineupsRef = useRef(lineups);
  lineupsRef.current = lineups;
  const isQuietRef = useRef(isQuiet);
  isQuietRef.current = isQuiet;
  const ids = tokensAt(script, minute * msPerMinute, lineups).map((t) => t.id);

  useLayoutEffect(() => {
    const el = tilt.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const g = size && size.width > 0 ? geometryOf(size.width, size.height, MAX_WIDTH) : null;
  const goals = useMemo(() => (g ? [goalParts(g, 0), goalParts(g, 1)] : null), [g?.width, g?.height, g?.near]);

  // The presentation clock: the round's minute plus how far into it the clock has run. The round's clock waits a
  // whole minute after every start or change of speed, so the board plays out the rest of the minute over that time.
  // `overrun` is how far past a stop on a goal the board played on, in minutes, so a resume carries on from there.
  const clock = useRef({ minute, tickAt: performance.now(), from: 0, frozen: 0, overrun: 0, isRunning, msPerMinute });
  const matchEnd = matchEndOf(match.events);
  useEffect(() => {
    const c = clock.current;
    const now = performance.now();
    const ran = () => c.from + (1 - c.from) * Math.min((now - c.tickAt) / c.msPerMinute, 0.999);
    if (minute !== c.minute) {
      c.minute = minute;
      c.tickAt = now;
      c.from = 0;
      c.frozen = 0;
      c.overrun = 0;
    }
    const isPlaying = isRunning && minute < matchEnd;
    if (!isPlaying && c.isRunning) {
      c.frozen = ran();
      c.overrun = 0;
    }
    if (isPlaying && (!c.isRunning || msPerMinute !== c.msPerMinute)) {
      c.from = c.isRunning ? ran() : c.frozen + c.overrun;
      c.overrun = 0;
      c.tickAt = now;
    }
    c.isRunning = isPlaying;
    c.msPerMinute = msPerMinute;
  }, [minute, isRunning, msPerMinute, matchEnd]);

  const tokenEls = useRef(new Map<string, HTMLDivElement>());
  const ballEl = useRef<HTMLDivElement>(null);
  const ballShadowEl = useRef<HTMLDivElement>(null);
  const trailEls = useRef<(HTMLDivElement | null)[]>([]);
  const chipEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLDivElement>(null);
  const tagEl = useRef<HTMLDivElement>(null);
  const netEls = useRef<(SVGGElement | null)[]>([]);
  const glowEls = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!g || !kits) return;
    const geo = g;
    const reduced = prefersReducedMotion();
    const positions = new Map<string, { x: number; y: number }>();
    const ball = { x: 0.5, y: 0.5, h: 0 };
    const trail: Point[] = [];
    let lastT = -1;
    let lastFrame = performance.now();
    let lean = "";
    let frame = 0;
    // The player carrying a tag, and until when on the frame clock.
    let tagged: { id: string; until: number } | null = null;

    const slap = springTiming({ stiffness: 520, damping: 22 });

    // Depth changes far less often than position; writing it only on change keeps frames to transforms.
    const depths = new WeakMap<HTMLElement, number>();
    const setDepth = (el: HTMLElement, z: number) => {
      if (depths.get(el) === z) return;
      depths.set(el, z);
      el.style.zIndex = String(z);
    };

    const place = (el: HTMLElement | null, p: Point, extra = "") => {
      if (el) el.style.transform = `translate3d(${p.u.toFixed(2)}px, ${p.v.toFixed(2)}px, 0) scale(${p.scale.toFixed(3)})${extra}`;
    };

    function presentationTime(now: number): number {
      const c = clock.current;
      const mpm = script.msPerMinute;
      if (reduced) return c.minute * mpm;
      if (c.isRunning) return (c.minute + c.from + (1 - c.from) * Math.min((now - c.tickAt) / c.msPerMinute, 0.999)) * mpm;
      // Stopped right on a goal: the ball still finishes its way into the net, short of the next minute and of the
      // change of ends at half-time.
      const base = (c.minute + c.frozen) * mpm;
      const goal = strikeNear(script, base, 50);
      if (goal?.kind === "goal") {
        const room = Math.min(OVERRUN_MS, (0.999 - c.frozen) * mpm, base < script.secondHalfAt ? script.secondHalfAt - base - 1 : Infinity);
        c.overrun = Math.min(c.overrun + (now - lastFrame) / mpm, Math.max(0, room) / mpm);
      }
      return base + c.overrun * mpm;
    }

    /** The tag over a player: in, held while he moves, then out. */
    function tag(beat: Beat, tokens: readonly Token[], ball: { x: number; y: number }, now: number) {
      const el = tagEl.current;
      const label = el?.firstElementChild;
      if (!el || !(label instanceof HTMLElement) || !beat.tag || isQuietRef.current) return;
      const side = tokens.filter((t) => t.side === beat.side && !t.isKeeper);
      // The shooter is whoever stands on the ball as he strikes it; anyone else is found by his id.
      const shooter =
        beat.kind === "shot" ? side.reduce<Token | null>((best, t) => (!best || Math.hypot(t.x - ball.x, t.y - ball.y) < Math.hypot(best.x - ball.x, best.y - ball.y) ? t : best), null) : null;
      const id = shooter?.id ?? (beat.playerId && tokenIdOf(beat.side, beat.playerId, lineupsRef.current[beat.side].sentOff));
      if (!id) return;
      label.textContent = beat.tag;
      el.dataset.side = beat.side;
      el.dataset.kind = beat.kind;
      tagged = { id, until: now + TAG_MS };
      label.getAnimations().forEach((a) => a.cancel());
      label.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
          : [
              { opacity: 0, transform: "translate(-50%, 6px) scale(0.6)" },
              { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.14 },
              { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.86 },
              { opacity: 0, transform: "translate(-50%, -4px) scale(0.96)" },
            ],
        { duration: TAG_MS, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" },
      );
      if (beat.kind === "substitution" && !reduced) {
        // The player going off turns over like a sticker into the one coming on.
        tokenEls.current.get(id)?.lastElementChild?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)", offset: 0.5 }, { transform: "scaleX(1)" }], { duration: 520, easing: "cubic-bezier(.65,0,.35,1)" });
      }
    }

    function fire(beat: Beat, tokens: readonly Token[], ball: { x: number; y: number }, now: number) {
      if (TAGGED.has(beat.kind)) tag(beat, tokens, ball, now);
      const chip = chipEl.current;
      const text = BEAT_TEXT[beat.kind];
      if (text && chip && kits) {
        const label = chip.firstElementChild;
        if (label) label.textContent = text;
        chip.dataset.kind = beat.kind;
        const club = beat.side === "home" ? home : away;
        const plate = club ? plateColours(club.colours) : null;
        chip.style.setProperty("--chip-bg", beat.kind === "goal" && plate ? plate.background : "");
        chip.style.setProperty("--chip-ink", beat.kind === "goal" && plate ? plate.text : "");
        place(chip, { ...project(geo, beat.x > 0.5 ? 1 : 0, 0.5 + POST + 0.06), scale: 1 });
        chip.getAnimations().forEach((a) => a.cancel());
        const hold = beat.kind === "shot" ? 420 : beat.kind === "goal" ? 1500 : 900;
        chip.animate(
          reduced
            ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
                { opacity: 0, scale: "1.8", rotate: "-8deg" },
                { opacity: 1, scale: "1", rotate: "-3deg", offset: 0.18 },
                { opacity: 1, scale: "1", rotate: "-3deg", offset: 0.82 },
                { opacity: 0, scale: "0.9", rotate: "-3deg" },
              ],
          { duration: hold + 300, easing: "linear", fill: "both" },
        );
      }
      if (beat.kind === "goal" && !reduced) {
        const end = beat.x > 0.5 ? 1 : 0;
        const dir = end === 1 ? 1 : -1;
        netEls.current[end]?.animate(
          [
            { transform: "translateX(0) scale(1, 1)" },
            { transform: `translateX(${dir * 5}px) scale(1.06, 1.04)`, offset: 0.16 },
            { transform: `translateX(${-dir * 2}px) scale(0.98, 1)`, offset: 0.42 },
            { transform: `translateX(${dir * 1}px) scale(1.01, 1)`, offset: 0.68 },
            { transform: "translateX(0) scale(1, 1)" },
          ],
          { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" },
        );
        glowEls.current[end]?.querySelectorAll("i").forEach((ring, i) =>
          ring.animate(
            [
              { opacity: 0.95, transform: "scale(0.25)" },
              { opacity: 0, transform: `translateX(${-dir * 26}px) scale(${1.9 + i * 0.5})` },
            ],
            { duration: 900 + i * 220, delay: i * 140, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" },
          ),
        );
        tilt.current?.animate([{ translate: "0 0" }, { translate: "0 3px", offset: 0.12 }, { translate: "0 0" }], { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)" });
      }
      if ((beat.kind === "yellow" || beat.kind === "red" || beat.kind === "injury") && markEl.current) {
        // A red card's player has just left the board; his card shows where he stood.
        const at = beat.playerId ? positions.get(tokenIdOf(beat.side, beat.playerId, lineupsRef.current[beat.side].sentOff)) : undefined;
        if (at) {
          const mark = markEl.current;
          mark.dataset.kind = beat.kind;
          place(mark, { ...project(geo, at.x, at.y, 0.05), scale: 1 });
          mark.getAnimations().forEach((a) => a.cancel());
          mark.animate(
            reduced
              ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
              : [
                  { opacity: 0, translate: "0 8px", rotate: "-14deg" },
                  { opacity: 1, translate: "0 0", rotate: "-6deg", offset: 0.22 },
                  { opacity: 1, translate: "0 0", rotate: "-6deg", offset: 0.8 },
                  { opacity: 0, translate: "0 -6px", rotate: "-6deg" },
                ],
            { duration: 1500, easing: slap.easing, fill: "both" },
          );
        }
      }
    }

    function draw(now: number) {
      const dt = Math.min(now - lastFrame, 64);
      const T = presentationTime(now);
      lastFrame = now;
      const tokens = tokensAt(script, T, lineupsRef.current);
      const k = reduced || lastT < 0 ? 1 : 1 - Math.exp(-dt / TOKEN_TAU_MS);
      for (const t of tokens) {
        const p = positions.get(t.id) ?? { x: t.x, y: t.y };
        p.x += (t.x - p.x) * k;
        p.y += (t.y - p.y) * k;
        positions.set(t.id, p);
        const el = tokenEls.current.get(t.id);
        if (el) {
          const pt = project(geo, p.x, p.y);
          place(el, pt);
          setDepth(el, 10 + Math.round(pt.depth * 1000));
        }
      }
      const target = ballAt(script, T);
      const kb = reduced || lastT < 0 || target.kind !== "roll" ? 1 : 1 - Math.exp(-dt / BALL_TAU_MS);
      ball.x += (target.x - ball.x) * kb;
      ball.y += (target.y - ball.y) * kb;
      ball.h += (target.h - ball.h) * kb;
      const ground = project(geo, ball.x, ball.y);
      const air = project(geo, ball.x, ball.y, ball.h);
      place(ballShadowEl.current, ground, ` scale(${(1 - Math.min(ball.h * 14, 0.55)).toFixed(3)})`);
      if (ballShadowEl.current) ballShadowEl.current.style.opacity = (0.55 - Math.min(ball.h * 8, 0.3)).toFixed(2);
      place(ballEl.current, air);
      if (ballEl.current) setDepth(ballEl.current, 12 + Math.round(ground.depth * 1000));
      trail.unshift(air);
      trail.length = Math.min(trail.length, 6);
      const isFast = !reduced && (target.kind === "shot" || target.kind === "air");
      trailEls.current.forEach((el, i) => {
        const p = trail[i + 1];
        if (!el || !p) return;
        place(el, p);
        el.style.opacity = isFast ? (0.34 - i * 0.075).toFixed(2) : "0";
        setDepth(el, 11 + Math.round(ground.depth * 1000));
      });
      if (lastT >= 0 && T > lastT) for (const beat of beatsBetween(script, lastT, T)) fire(beat, tokens, target, now);
      lastT = T;
      const tagAt = tagged && now < tagged.until ? positions.get(tagged.id) : null;
      if (tagAt && tagEl.current) place(tagEl.current, { ...project(geo, tagAt.x, tagAt.y), scale: 1 });
      else tagged = null;
      const nextLean = reduced || isQuietRef.current ? "" : ball.x < 0.32 ? "left" : ball.x > 0.68 ? "right" : "";
      if (nextLean !== lean && tilt.current) {
        lean = nextLean;
        tilt.current.dataset.lean = lean;
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [g?.width, g?.height, script, kits, goals]);

  if (!home || !away || !kits) return null;
  const keeper = { home: keeperKit(kits, "home"), away: keeperKit(kits, "away") };
  const corners = g ? pathOf(g, [[-RUN_X, -RUN_Y], [1 + RUN_X, -RUN_Y], [1 + RUN_X, 1 + RUN_Y], [-RUN_X, 1 + RUN_Y]], true) : "";
  const front = g
    ? (() => {
        const l = project(g, -RUN_X, 1 + RUN_Y);
        const r = project(g, 1 + RUN_X, 1 + RUN_Y);
        return `M${l.u} ${l.v}L${r.u} ${r.v}L${r.u} ${r.v + THICKNESS}L${l.u} ${l.v + THICKNESS}Z`;
      })()
    : "";
  const stripes = g
    ? Array.from({ length: STRIPES }, (_, i) =>
        pathOf(g, [[i / STRIPES, -RUN_Y], [(i + 1) / STRIPES, -RUN_Y], [(i + 1) / STRIPES, 1 + RUN_Y], [i / STRIPES, 1 + RUN_Y]], true),
      )
    : [];

  return (
    <div
      className={isQuiet ? "lp is-quiet" : "lp"}
      aria-hidden="true"
      data-goals={match.events.flatMap((e) => (e.type === "goal" ? [`${e.minute}${e.clubId === match.homeId ? "h" : "a"}`] : [])).join(" ")}
    >
      {caption}
      <div className="lp-tilt" ref={tilt}>
        {g && goals && (
          <>
            <svg className="lp-board" width={g.width} height={g.height}>
              <defs>
                <filter id={`${svgId}-blur`} x="-10%" y="-40%" width="120%" height="180%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
                <radialGradient id={`${svgId}-vignette`} cx="50%" cy="62%" r="62%">
                  <stop offset="55%" stopColor="#000" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.32" />
                </radialGradient>
                <linearGradient id={`${svgId}-light`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#000" stopOpacity="0.22" />
                  <stop offset="0.45" stopColor="#000" stopOpacity="0" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.07" />
                </linearGradient>
              </defs>
              <path className="lp-shadow" d={corners} transform={`translate(0 ${THICKNESS + 5})`} filter={`url(#${svgId}-blur)`} />
              <path className="lp-front" d={front} />
              <path className="lp-run" d={corners} />
              {stripes.map((d, i) => (
                <path key={i} className={i % 2 ? "lp-stripe b" : "lp-stripe a"} d={d} />
              ))}
              <path d={corners} fill={`url(#${svgId}-light)`} />
              <path d={corners} fill={`url(#${svgId}-vignette)`} />
              <path className="lp-lines" d={markings(g)} />
              <path className="lp-bevel" d={pathOf(g, [[-RUN_X, 1 + RUN_Y], [1 + RUN_X, 1 + RUN_Y]])} />
              {goals.map((goal, end) => (
                <g key={end}>
                  <g
                    className="lp-net"
                    ref={(el) => {
                      netEls.current[end] = el;
                    }}
                    style={{ transformOrigin: `${goal.mouth.u}px ${goal.mouth.v}px` }}
                  >
                    <path className="lp-net-fill" d={goal.backNet + goal.sideFar + goal.roof} />
                    <path className="lp-mesh" d={goal.mesh} />
                  </g>
                  <path className="lp-post" d={goal.farPost} />
                </g>
              ))}
            </svg>
            {goals.map((goal, end) => (
              <div
                key={end}
                className="lp-glow"
                ref={(el) => {
                  glowEls.current[end] = el;
                }}
                style={{ transform: `translate3d(${goal.mouth.u}px, ${goal.mouth.v + 10}px, 0)` }}
              >
                <i />
                <i />
              </div>
            ))}
            {ids.map((id) => {
              const side: Side = id.startsWith("home") ? "home" : "away";
              const isKeeper = id.endsWith("-0");
              const kit = kits[side];
              return (
                <div
                  key={id}
                  className="lp-tok"
                  ref={(el) => {
                    if (el) tokenEls.current.set(id, el);
                    else tokenEls.current.delete(id);
                  }}
                >
                  <i className="lp-tok-shadow" />
                  <i className="lp-tok-body" style={{ ["--c1" as string]: isKeeper ? keeper[side] : kit.body, ["--c2" as string]: isKeeper ? "#14231a" : kit.ring }} />
                </div>
              );
            })}
            <div className="lp-ball-shadow" ref={ballShadowEl} />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="lp-ball ghost"
                ref={(el) => {
                  trailEls.current[i] = el;
                }}
              />
            ))}
            <div className="lp-ball" ref={ballEl} />
            <svg className="lp-front-goals" width={g.width} height={g.height} style={{ zIndex: 10 + Math.round((goals[0]?.nearDepth ?? 0.55) * 1000) }}>
              {goals.map((goal, end) => (
                <g key={end}>
                  <path className="lp-net-fill near" d={goal.sideNear} />
                  <path className="lp-post" d={goal.frame} />
                </g>
              ))}
            </svg>
            <div className="lp-chip" ref={chipEl}>
              <b />
            </div>
            <div className="lp-mark" ref={markEl} />
            <div className="lp-tag" ref={tagEl}>
              <b />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
