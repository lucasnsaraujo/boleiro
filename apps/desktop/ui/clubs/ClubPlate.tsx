import type { Club } from "@boleiro/data/clubs";
import { plateColours } from "./clubCatalog.js";
import "./plate.css";

type Props = { club: Pick<Club, "shortName" | "colours">; size?: "big" | "row" };

/** The club's name on a plate in its colours, as Brasfoot paints it. */
export function ClubPlate({ club, size = "big" }: Props) {
  const { background, text } = plateColours(club.colours);
  return (
    <span className={size === "big" ? "club-plate" : "club-plate club-plate-row"} style={{ background, color: text }}>
      {club.shortName}
    </span>
  );
}
