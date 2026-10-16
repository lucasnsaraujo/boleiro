import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { LiveRound, Side } from "@boleiro/game-client/round/liveRoundOf";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { LivePitch } from "./LivePitch.js";
import { MiniScore } from "./MiniScore.js";
import type { MatchAt } from "./roundAt.js";
import { SEAT_GAP_PX, seatLayoutOf } from "./seatLayout.js";
import "./hotSeat.css";

/** A human coach's board in a hot-seat round: his name, his match as it stands, and both sides' formations. */
export type Seat = { clubId: string; coach: string; match: MatchAt; formations: Record<Side, Formation> };

const ARROW_PX = 44;
const PEEK_PX = 70;
const FOCUS_MAX_PX = 600;
const AWAY_SCALE = 0.84;
const SLIDE = springTiming({ stiffness: 170, damping: 24 });

type Props = {
  seats: readonly Seat[];
  /** The board in focus: the coach Space and the arrows are on. */
  focus: number;
  onFocus: (index: number) => void;
  round: LiveRound;
  minute: number;
  isRunning: boolean;
  msPerMinute: number;
};

/**
 * Every human coach's board side by side when each gets at least 360 px; otherwise the one in focus, its
 * neighbours peeking at the sides, stepped with the arrows on screen or ← →. The coach in focus wears yellow.
 */
export function HotSeatPitches({ seats, focus, onFocus, round, minute, isRunning, msPerMinute }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const isSideBySide = seatLayoutOf(width, seats.length) === "sideBySide";
  const step = (by: number) => onFocus((focus + by + seats.length) % seats.length);

  const focusWidth = Math.min(FOCUS_MAX_PX, width - 2 * (ARROW_PX + PEEK_PX));
  const viewport = width - 2 * ARROW_PX;
  // Each board's place counted from the one in focus, round the ring, so the coach before the first peeks on the left.
  const half = Math.floor(seats.length / 2);
  const places = seats.map((_, index) => ((index - focus + seats.length + half) % seats.length) - half);
  const lastPlaces = useRef<number[]>(places);
  useEffect(() => {
    lastPlaces.current = places;
  });
  const isReduced = prefersReducedMotion();

  const carouselStyle = (index: number): CSSProperties => {
    const place = places[index] ?? 0;
    const before = lastPlaces.current[index] ?? place;
    // A board going round the ring from one end to the other jumps there unseen instead of sliding across.
    const isWrapping = Math.abs(place - before) > 1;
    return {
      width: focusWidth,
      // A neighbour shrinks round its centre and stands a gap from the board in focus, so its near edge always peeks in.
      transform: `translate3d(${viewport / 2 - focusWidth / 2 + place * ((focusWidth * (1 + AWAY_SCALE)) / 2 + SEAT_GAP_PX)}px, 0, 0) scale(${place === 0 ? 1 : AWAY_SCALE})`,
      opacity: place === 0 ? 1 : Math.abs(place) > 1 ? 0 : 0.42,
      transition: isWrapping || isReduced ? "none" : `transform ${SLIDE.duration}ms ${SLIDE.easing}, opacity 420ms var(--e-out)`,
    };
  };

  const board = (seat: Seat, index: number) => {
    const home = round.clubs[seat.match.homeId];
    const away = round.clubs[seat.match.awayId];
    const isFocus = index === focus;
    const isSeen = isSideBySide || Math.abs(places[index] ?? 0) <= 1;
    if (!home || !away) return null;
    const { score } = seat.match;
    return (
      <section
        key={seat.clubId}
        className={isSideBySide || isFocus ? "seat" : "seat is-away"}
        style={isSideBySide ? undefined : carouselStyle(index)}
        aria-label={`${seat.coach}: ${home.shortName} ${score.home} x ${score.away} ${away.shortName}`}
        aria-current={isFocus ? "true" : undefined}
        aria-hidden={isSeen ? undefined : "true"}
        onClick={isFocus ? undefined : () => onFocus(index)}
      >
        {isSeen && (
          <LivePitch
            match={seat.match}
            clubs={round.clubs}
            names={round.names}
            minute={minute}
            isRunning={isRunning}
            msPerMinute={msPerMinute}
            formations={seat.formations}
            isQuiet={!isSideBySide && !isFocus}
            caption={
              <header className="seat-cap">
                <span className={isFocus ? "seat-coach is-focus" : "seat-coach"}>{seat.coach}</span>
                <MiniScore home={home} away={away} score={score} />
              </header>
            }
          />
        )}
      </section>
    );
  };

  if (isSideBySide) {
    return (
      <div className="live-seats" ref={box} style={{ gridTemplateColumns: `repeat(${seats.length}, minmax(0, 1fr))` }}>
        {seats.map(board)}
      </div>
    );
  }
  return (
    <div className="live-seats is-focus" ref={box}>
      <button className="seat-arrow" aria-label="Técnico anterior" onClick={() => step(-1)}>
        <i className="ph-bold ph-caret-left" aria-hidden="true" />
      </button>
      <div className="seat-viewport">
        <div className="seat-track">{seats.map(board)}</div>
        <div className="seat-dots" aria-hidden="true" style={{ ["--dots" as string]: seats.length, ["--on" as string]: focus }}>
          {seats.map((seat) => (
            <i key={seat.clubId} />
          ))}
          <b />
        </div>
      </div>
      <button className="seat-arrow" aria-label="Próximo técnico" onClick={() => step(1)}>
        <i className="ph-bold ph-caret-right" aria-hidden="true" />
      </button>
    </div>
  );
}
