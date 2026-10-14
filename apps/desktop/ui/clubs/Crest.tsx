import { useState } from "react";
import type { Club } from "@boleiro/data/clubs";
import { crestUrlOf, initialsOf, plateColours } from "./clubCatalog.js";
import "./crest.css";

type Props = { club: Pick<Club, "id" | "shortName" | "colours">; size?: number };

/** The club's real crest, or a shield in its colours with its initials when there is none. */
export function Crest({ club, size = 32 }: Props) {
  const url = crestUrlOf(club.id, size);
  const retinaUrl = crestUrlOf(club.id, size * 2);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <img
        className="crest"
        src={url}
        srcSet={retinaUrl ? `${url} 1x, ${retinaUrl} 2x` : undefined}
        alt={club.shortName}
        width={size}
        height={size}
        onError={() => setFailedUrl(url)}
      />
    );
  }
  const { primary, secondary } = club.colours;
  const { text } = plateColours(club.colours);
  return (
    <svg className="crest" role="img" aria-label={club.shortName} viewBox="0 0 46 54" width={(size * 46) / 54} height={size}>
      <path d="M3 3h40v24c0 13-9 20-20 24C12 47 3 40 3 27z" fill={primary} stroke={secondary} strokeWidth="3" />
      <text x="23" y="34" textAnchor="middle" fontFamily="IBM Plex Sans Condensed" fontWeight="700" fontSize="14" fill={text}>
        {initialsOf(club.shortName)}
      </text>
    </svg>
  );
}
