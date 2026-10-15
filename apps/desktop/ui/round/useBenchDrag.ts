import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";

// A press has to travel this far before it lifts the sticker, so a click on a bench row stays a click.
const LIFT_DISTANCE = 5;

/** A bench player being carried towards the pitch: where the pointer is and the starter it is over, if he can make way. */
export type BenchDrag = { player: SquadPlayer; x: number; y: number; overId: string | null };

type Options = {
  /** Whether `player` may come on for the starter `starterId`. */
  canDrop: (starterId: string, player: SquadPlayer) => boolean;
  onDrop: (starterId: string, player: SquadPlayer) => void;
};

/** The starter whose sticker is under the pointer: the one the browser finds at the point, or the event's own target where it can't look. */
function starterAt(event: PointerEvent): string | null {
  const under = document.elementFromPoint?.(event.clientX, event.clientY) ?? (event.target instanceof Element ? event.target : null);
  return under?.closest<HTMLElement>("[data-starter]")?.dataset.starter ?? null;
}

/** Drag and drop from the bench onto a starter's sticker, with pointer events so it works alike with a mouse, a pen and a finger. */
export function useBenchDrag({ canDrop, onDrop }: Options) {
  const [drag, setDrag] = useState<BenchDrag | null>(null);
  const options = useRef({ canDrop, onDrop });
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    options.current = { canDrop, onDrop };
  });
  useEffect(() => () => stop.current?.(), []);

  function startDrag(event: ReactPointerEvent, player: SquadPlayer) {
    if (event.button !== 0) return;
    stop.current?.();
    const from = { x: event.clientX, y: event.clientY };
    let isLifted = false;
    let overId: string | null = null;
    const move = (e: PointerEvent) => {
      isLifted ||= Math.hypot(e.clientX - from.x, e.clientY - from.y) >= LIFT_DISTANCE;
      if (!isLifted) return;
      const starter = starterAt(e);
      overId = starter && options.current.canDrop(starter, player) ? starter : null;
      setDrag({ player, x: e.clientX, y: e.clientY, overId });
    };
    const end = (e: PointerEvent) => {
      if (isLifted && e.type === "pointerup") {
        const starter = starterAt(e) ?? overId;
        if (starter && options.current.canDrop(starter, player)) options.current.onDrop(starter, player);
      }
      finish();
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      stop.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    stop.current = finish;
  }

  return { drag, startDrag };
}
