import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import type { Cue } from "../sound/soundCatalog.js";
import { useSound } from "../sound/SoundProvider.js";
import { surfaceOf, type Surface, type Tick } from "./paperMotion.js";
import "./moments.css";

/** The artboard every scene is laid out on; the stage scales it to the window, 1024 to 1600 px wide and more. */
export const ARTBOARD = { width: 1280, height: 720 };
// The last frame holds a second after the choreography ends, as the mocks' clock does.
const HOLD_MS = 1000;
// A cue whose beat the clock passed more than this long ago (a frame held up by a busy tab) stays quiet rather than land late.
const CUE_GRACE_MS = 400;

type Clock = {
  addTick: (tick: Tick) => () => void;
  /** Plays `cue` when the scene's clock passes `at` ms. */
  addCue: (cue: Cue, at: number) => () => void;
  /** The milliseconds since the scene started, frozen while it isn't playing. */
  now: () => number;
  scale: number;
};

const ClockContext = createContext<Clock | null>(null);

/** Runs `tick` with the scene's milliseconds on every frame, and once at once with the current one. */
export function useTick(tick: Tick) {
  const clock = useContext(ClockContext);
  const latest = useRef(tick);
  useLayoutEffect(() => {
    latest.current = tick;
  });
  useEffect(() => {
    if (!clock) return;
    const run: Tick = (t) => latest.current(t);
    run(clock.now());
    return clock.addTick(run);
  }, [clock]);
}

/** A canvas drawn on the scene's clock: `make` builds its frame function once the canvas has its size, and again when the stage scales. */
export function useCanvasTick(make: (surface: Surface) => Tick) {
  const clock = useContext(ClockContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(make);
  useLayoutEffect(() => {
    latest.current = make;
  });
  const scale = clock?.scale ?? 1;
  useEffect(() => {
    const element = canvas.current;
    if (!clock || !element) return;
    const surface = surfaceOf(element, scale);
    if (!surface) return;
    const tick = latest.current(surface);
    tick(clock.now());
    return clock.addTick(tick);
  }, [clock, scale]);
  return canvas;
}

/**
 * Plays a sound once when the scene's clock passes `at`, while it plays; a skipped scene stays quiet. With
 * less motion the scene shows its last frame at once, but its sounds still come on their beats.
 */
export function useCueAt(cue: Cue, at: number) {
  const clock = useContext(ClockContext);
  useEffect(() => clock?.addCue(cue, at), [clock, cue, at]);
}

type Props = {
  /** The choreography's length; the actions arrive and the skip button leaves at its end. */
  durationMs: number;
  /** The scene's own colour around the artboard, when the window is wider or taller than it; it can line up with the artboard through --mo-k, --mo-left and --mo-top. */
  backdrop: string;
  /** "dark" scenes print the skip and replay in light ink. */
  tone: "light" | "dark";
  label: string;
  className: string;
  /** What the coach does once it has played: continue, open the album, take the offer. */
  actions: ReactNode;
  children: ReactNode;
};

/**
 * A career moment's stage: the scene on a 1280×720 artboard scaled to the window, every CSS animation inside it
 * started together once the fonts are in, and the canvas parts drawn from the same clock. "Pular" or Esc jumps
 * to the last frame, "Ver de novo" plays it again; with less motion asked for, the last frame shows at once.
 */
export function MomentStage({ durationMs, backdrop, tone, label, className, actions, children }: Props) {
  const { engine } = useSound();
  const area = useRef<HTMLDivElement>(null);
  const cues = useRef(new Set<{ cue: Cue; at: number }>());
  // The last scene time the cues were checked against, so each plays as the clock crosses it.
  const heardUntil = useRef(-1);
  const cueTimers = useRef<number[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const ticks = useRef(new Set<Tick>());
  const time = useRef({ t0: 0, frozen: 0, isRunning: false });
  const raf = useRef(0);
  const [scale, setScale] = useState(1);
  const [place, setPlace] = useState({ left: 0, top: 0 });
  const [isReady, setReady] = useState(false);
  const [isEnded, setEnded] = useState(false);
  const end = durationMs + HOLD_MS;

  const now = useCallback(() => (time.current.isRunning ? performance.now() - time.current.t0 : time.current.frozen), []);
  const draw = useCallback((t: number) => {
    for (const tick of ticks.current) tick(t);
  }, []);

  /** Plays the cues the clock has crossed since it was last heard, unless the frame came too late for them to land on their beat. */
  const hear = useCallback(
    (t: number) => {
      for (const { cue, at } of cues.current) if (at > heardUntil.current && at <= t && t < at + CUE_GRACE_MS) engine.play(cue);
      heardUntil.current = t;
    },
    [engine],
  );

  const silence = useCallback(() => {
    cueTimers.current.forEach((timer) => clearTimeout(timer));
    cueTimers.current = [];
  }, []);

  const animations = useCallback(() => stage.current?.getAnimations?.({ subtree: true }) ?? [], []);

  const seekEnd = useCallback(() => {
    cancelAnimationFrame(raf.current);
    silence();
    time.current = { t0: 0, frozen: end, isRunning: false };
    for (const animation of animations()) {
      animation.pause();
      animation.currentTime = end;
    }
    draw(end);
    setEnded(true);
  }, [animations, draw, end, silence]);

  /** Less motion: the last frame at once, and each sound on its own timer at its beat. */
  const showEnd = useCallback(() => {
    seekEnd();
    cueTimers.current = [...cues.current].map(({ cue, at }) => window.setTimeout(() => engine.play(cue), at));
  }, [engine, seekEnd]);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    for (const animation of animations()) {
      animation.currentTime = 0;
      animation.play();
    }
    time.current = { t0: performance.now(), frozen: 0, isRunning: true };
    heardUntil.current = -1;
    setEnded(false);
    const loop = () => {
      const t = now();
      hear(t);
      draw(Math.min(t, end));
      if (t >= durationMs) setEnded(true);
      if (t < end) raf.current = requestAnimationFrame(loop);
      else {
        time.current = { t0: 0, frozen: end, isRunning: false };
      }
    };
    raf.current = requestAnimationFrame(loop);
  }, [animations, draw, durationMs, end, hear, now]);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const fit = () => {
      const k = Math.min(element.clientWidth / ARTBOARD.width, element.clientHeight / ARTBOARD.height) || 1;
      setScale(k);
      setPlace({ left: (element.clientWidth - ARTBOARD.width * k) / 2, top: element.offsetTop + (element.clientHeight - ARTBOARD.height * k) / 2 });
    };
    fit();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let current = true;
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts.ready : Promise.resolve();
    fonts.then(() => current && setReady(true), () => current && setReady(true));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (prefersReducedMotion()) showEnd();
    else play();
    return () => {
      cancelAnimationFrame(raf.current);
      silence();
    };
  }, [isReady, play, showEnd, silence]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isEnded) {
        event.preventDefault();
        seekEnd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEnded, seekEnd]);

  const clock = useMemo<Clock>(
    () => ({
      addTick: (tick) => {
        ticks.current.add(tick);
        return () => ticks.current.delete(tick);
      },
      addCue: (cue, at) => {
        const entry = { cue, at };
        cues.current.add(entry);
        return () => cues.current.delete(entry);
      },
      now,
      scale,
    }),
    [now, scale],
  );

  return (
    // Where the artboard sits in the window, so a scene's backdrop can line its colours up with it.
    <div className={`mo-frame is-${tone}`} style={{ background: backdrop, "--mo-k": scale, "--mo-left": `${place.left}px`, "--mo-top": `${place.top}px` } as CSSProperties}>
      <div className="mo-drag" data-tauri-drag-region />
      <div ref={area} className="mo-area">
        <ClockContext.Provider value={clock}>
          <div
            ref={stage}
            role="region"
            aria-label={label}
            className={`mo-stage ${className}${isReady ? " is-ready" : ""}`}
            data-state={isEnded ? "ended" : "playing"}
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            {children}
            <div className="mo-acts">
              {!isEnded && (
                <button className="mo-skip" onClick={seekEnd}>
                  Pular <span className="kbd">Esc</span>
                </button>
              )}
              {isEnded && (
                <div className="mo-cta">
                  {!prefersReducedMotion() && (
                    <button className="mo-replay" onClick={play}>
                      <i className="ph-bold ph-arrows-clockwise" aria-hidden="true" />
                      Ver de novo
                    </button>
                  )}
                  {actions}
                </div>
              )}
            </div>
          </div>
        </ClockContext.Provider>
      </div>
    </div>
  );
}
