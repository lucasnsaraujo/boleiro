import type { CSSProperties } from "react";
import type { ClubTag, MomentSticker as Sticker } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../clubs/Crest.js";
import { readableOn } from "./paperMotion.js";

/** A club tag as the crest reads it. */
export const crestClub = (club: ClubTag) => ({ id: club.id, shortName: club.name, colours: club.colours });

/** The club's colours as a sticker's art paints them: its first colour, the initial in a colour that reads on it. */
export function artColours(club: ClubTag): CSSProperties {
  return { "--c": club.colours.primary, "--ci": readableOn(club.colours.primary, club.colours.secondary) } as CSSProperties;
}

type Props = {
  sticker: Sticker;
  className?: string;
  style?: CSSProperties;
  /** Shows the club's crest in the art's corner, at this size. */
  crest?: number;
  /** Shows the foil catching the light once, at this many ms of the scene. */
  sheenAt?: number;
  showCaption?: boolean;
};

/** A player's or the coach's sticker: white die-cut card, the club's colour, the initial, the name and a caption. */
export function MomentSticker({ sticker, className = "", style, crest, sheenAt, showCaption = true }: Props) {
  const shiny = sticker.isShiny ? " shiny" : "";
  return (
    <div className={`ps${shiny} ${className}`} style={{ ...artColours(sticker.club), ...(sheenAt !== undefined ? ({ "--sheen-at": sheenAt } as CSSProperties) : {}), ...style }}>
      <div className="art">
        {crest ? <Crest club={crestClub(sticker.club)} size={crest} /> : null}
        {sticker.number && <em>{sticker.number}</em>}
        <b>{sticker.initial}</b>
        {sheenAt !== undefined && <span className="sheen" />}
      </div>
      <div className="nm">{sticker.name}</div>
      {showCaption && sticker.caption && <div className="cl">{sticker.caption}</div>}
    </div>
  );
}
