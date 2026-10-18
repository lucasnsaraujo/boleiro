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

type Clock = {
  addTick: (tick: Tick) => () => void;
  /** The milliseconds since the scene started, frozen while it isn't playing. */
  now: () => number;
  scale: number;
  /** Whether the scene is playing now, not skipped or ended. */
  isPlaying: () => boolean;
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

/** Plays a sound once when the scene's clock passes `at`, while it plays; a skipped scene stays quiet. */
export function useCueAt(cue: Cue, at: number) {
  const { engine } = useSound();
  const clock = useContext(ClockContext);
  const played = useRef(false);
  useTick((t) => {
    if (t < at) played.current = false;
    else if (!played.current && clock?.isPlaying() && t < at + 400) {
      played.current = true;
      engine.play(cue);
    }
  });
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
  const area = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ticks = useRef(new Set<Tick>());
  const time = useRef({ t0: 0, frozen: 0, isRunning: false });
  const raf = useRef(0);
  const [scale, setScale] = useState(1);
  const [place, setPlace] = useState({ left: 0, top: 0 });
  const [isReady, setReady] = useState(false);
  const playing = useRef(false);
  const [isEnded, setEnded] = useState(false);
  const end = durationMs + HOLD_MS;

  const now = useCallback(() => (time.current.isRunning ? performance.now() - time.current.t0 : time.current.frozen), []);
  const draw = useCallback((t: number) => {
    for (const tick of ticks.current) tick(t);
  }, []);

  const animations = useCallback(() => stage.current?.getAnimations?.({ subtree: true }) ?? [], []);

  const seekEnd = useCallback(() => {
    cancelAnimationFrame(raf.current);
    time.current = { t0: 0, frozen: end, isRunning: false };
    for (const animation of animations()) {
      animation.pause();
      animation.currentTime = end;
    }
    draw(end);
    playing.current = false;
    setEnded(true);
  }, [animations, draw, end]);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    for (const animation of animations()) {
      animation.currentTime = 0;
      animation.play();
    }
    time.current = { t0: performance.now(), frozen: 0, isRunning: true };
    playing.current = true;
    setEnded(false);
    const loop = () => {
      const t = now();
      draw(Math.min(t, end));
      if (t >= durationMs) setEnded(true);
      if (t < end) raf.current = requestAnimationFrame(loop);
      else {
        time.current = { t0: 0, frozen: end, isRunning: false };
        playing.current = false;
      }
    };
    raf.current = requestAnimationFrame(loop);
  }, [animations, draw, durationMs, end, now]);

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
    if (prefersReducedMotion()) seekEnd();
    else play();
    return () => cancelAnimationFrame(raf.current);
  }, [isReady, play, seekEnd]);

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
      now,
      scale,
      isPlaying: () => playing.current,
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
