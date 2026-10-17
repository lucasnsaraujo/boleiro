import type { CSSProperties, ReactNode } from "react";
import type { Club } from "@boleiro/data/clubs";
import { Crest } from "../clubs/Crest.js";
import { plateColours } from "../clubs/clubCatalog.js";

type Props = {
  name: string;
  club: Pick<Club, "id" | "shortName" | "colours"> | null;
  /** The album's code printed in the corner: "BO 26", "BP 03". */
  code?: string;
  /** The line under the name. */
  caption?: string;
  isWinner?: boolean;
  /** Its place in the order the page sticks them in, for the stagger. */
  order?: number;
  size?: "hero" | "row" | "mini";
  children?: ReactNode;
};

/** A player's sticker as the album prints it: his club's colours behind his initial, its crest in the corner, foil for a winner. */
export function AwardSticker({ name, club, code, caption, isWinner = false, order = 0, size = "row", children }: Props) {
  const colours = club ? plateColours(club.colours) : { background: "#3C4A40", text: "#FFFFFF" };
  const style = { "--c": colours.background, "--ic": colours.text, "--i": order } as CSSProperties;
  const crestSize = size === "hero" ? 30 : size === "mini" ? 15 : 18;
  return (
    <div className={`aw-stk is-${size}${isWinner ? " is-win" : ""}`} style={style}>
      <div className="aw-art" aria-hidden="true">
        {club && <Crest club={club} size={crestSize} />}
        {code && <em>{code}</em>}
        <b>{initialOf(name)}</b>
      </div>
      {size !== "mini" && (
        <div className="aw-cap">
          <span className="aw-name">{name}</span>
          {caption && <span className="aw-sub">{caption}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** The first letter of a name, the way the album prints it on the sticker. */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
