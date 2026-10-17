import type { CSSProperties } from "react";
import type { EggNote } from "@boleiro/engine/sim/eggs/findEggs";
import { EggArt } from "./EggArt.js";
import "./eggNoteCard.css";

/** An egg a match laid, taped beside it: a small sticker in the egg's rarity print and the almanac's line. */
export function EggNoteCard({ note, className = "", style }: { note: EggNote; className?: string; style?: CSSProperties }) {
  return (
    <p role="note" aria-label={`Almanaque: ${note.title}`} className={`egg-note ${className}`} style={style}>
      <span className={`egg-note-stk ${note.rarity}`} aria-hidden="true">
        <span className="egg-note-face">
          <EggArt eggId={note.eggId} />
        </span>
      </span>
      <span className="egg-note-text">
        <span className="lbl">Almanaque · {note.title}</span>
        {note.text}
      </span>
    </p>
  );
}
