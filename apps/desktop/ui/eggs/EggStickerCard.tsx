import type { EggRarity } from "@boleiro/engine/sim/eggs/eggType";
import type { EggSticker } from "@boleiro/game-client/eggs/eggAlbum";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { EggArt } from "./EggArt.js";
import "./eggSticker.css";

export const RARITY_NAMES: Record<EggRarity, string> = { rare: "Rara", veryRare: "Raríssima", legendary: "Lendária" };
const STARS: Record<EggRarity, number> = { rare: 1, veryRare: 2, legendary: 3 };

/** "R07": a rarity's place in the album, numbered as the album's stickers are. */
export const stickerNumber = (number: number) => `R${String(number).padStart(2, "0")}`;

/** A small four-pointed star, the rarity's mark. */
function Star() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 0l1.3 3.7L10 5 6.3 6.3 5 10 3.7 6.3 0 5l3.7-1.3z" />
    </svg>
  );
}

type Props = { sticker: Pick<EggSticker, "eggId" | "number" | "title" | "rarity" | "look"> & { date?: EggSticker["date"] } };

/**
 * An egg's sticker: die-cut, its face in its rarity's print (green for a rare one, blue foil for a
 * very rare one, gold holo for a legendary one), its drawing, number and stars, and below the face
 * its name and the day it was found. A special page prints twice as wide.
 */
export function EggStickerCard({ sticker }: Props) {
  const { eggId, number, title, rarity, look, date } = sticker;
  return (
    <figure className={`egg-stk ${rarity}${look === "page" ? " page" : ""}`} aria-label={`${stickerNumber(number)} ${title}, ${RARITY_NAMES[rarity].toLowerCase()}`}>
      <div className="egg-stk-face">
        <span className="egg-stk-no">{stickerNumber(number)}</span>
        <span className="egg-stk-stars">
          {Array.from({ length: STARS[rarity] }, (_, i) => (
            <Star key={i} />
          ))}
        </span>
        <EggArt eggId={eggId} />
        {look === "page" && <span className="egg-stk-ribbon">Página especial</span>}
      </div>
      <figcaption>
        <b>{title}</b>
        <small>{date ? `${formatDayMonth(date)} ${date.slice(0, 4)}` : RARITY_NAMES[rarity]}</small>
      </figcaption>
    </figure>
  );
}
