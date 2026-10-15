import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import "./rangeSlider.css";

type Range = [low: number, high: number];

type Props = {
  /** The group's name; each handle is called "<label> mínima" and "<label> máxima". */
  label: string;
  min: number;
  max: number;
  value: Range;
  onChange: (value: Range) => void;
};

const PAGE = 5;
type End = 0 | 1;

/** A two-handle range in the Álbum pill: both numbers printed, each handle a slider for the keyboard. */
export function RangeSlider({ label, min, max, value, onChange }: Props) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const handles = useRef<(HTMLSpanElement | null)[]>([null, null]);
  const dragging = useRef<{ end: End; pointerId: number } | null>(null);
  const [low, high] = value;
  const span = Math.max(1, max - min);
  const percent = (n: number) => ((n - min) / span) * 100;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  function move(end: End, to: number) {
    const next: Range = end === 0 ? [clamp(Math.round(to), min, high), high] : [low, clamp(Math.round(to), low, max)];
    if (next[0] !== low || next[1] !== high) onChange(next);
  }

  function onKeyDown(end: End, event: KeyboardEvent<HTMLSpanElement>) {
    const now = value[end];
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: PAGE, PageDown: -PAGE };
    const to = event.key === "Home" ? min : event.key === "End" ? max : step[event.key] === undefined ? null : now + (step[event.key] ?? 0);
    if (to === null) return;
    event.preventDefault();
    move(end, to);
  }

  function valueAt(clientX: number): number {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return min;
    return min + clamp((clientX - box.left) / box.width, 0, 1) * span;
  }

  function onPointerDown(event: PointerEvent<HTMLSpanElement>) {
    const at = valueAt(event.clientX);
    const end: End = low === high ? (at > high ? 1 : 0) : Math.abs(at - low) <= Math.abs(at - high) ? 0 : 1;
    dragging.current = { end, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    handles.current[end]?.focus();
    event.preventDefault();
    move(end, at);
  }

  function onPointerMove(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragging.current;
    if (drag && drag.pointerId === event.pointerId) move(drag.end, valueAt(event.clientX));
  }

  function stopDragging() {
    dragging.current = null;
  }

  const handle = (end: End) => (
    <span
      ref={(element) => {
        handles.current[end] = element;
      }}
      role="slider"
      tabIndex={0}
      aria-label={`${label} ${end === 0 ? "mínima" : "máxima"}`}
      aria-valuemin={end === 0 ? min : low}
      aria-valuemax={end === 0 ? high : max}
      aria-valuenow={value[end]}
      className="range-thumb"
      style={{ left: `${percent(value[end])}%` }}
      onKeyDown={(event) => onKeyDown(end, event)}
    />
  );

  return (
    <div role="group" aria-label={label} className="field range">
      <small>{label}</small>
      <b className="range-num" aria-hidden="true">
        {low}
      </b>
      <span ref={trackRef} className="range-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}>
        <span className="range-fill" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
        {handle(0)}
        {handle(1)}
      </span>
      <b className="range-num" aria-hidden="true">
        {high}
      </b>
    </div>
  );
}
