import { useState } from "react";
import { plateColours } from "../clubs/clubCatalog.js";
import { nationalCrestUrlOf } from "./nationalCrests.js";

type Props = { teamId: string; code: string; colours: { primary: string; secondary: string }; size?: number; label?: string };

/** A national team's federation crest; without one, a die-cut shield in its kit colours with its FIFA code. */
export function NationalCrest({ teamId, code, colours, size = 32, label = code }: Props) {
  const url = nationalCrestUrlOf(teamId, size);
  const retinaUrl = nationalCrestUrlOf(teamId, size * 2);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <img
        className="crest nt-crest"
        src={url}
        srcSet={retinaUrl && retinaUrl !== url ? `${url} 1x, ${retinaUrl} 2x` : undefined}
        alt={label}
        width={size}
        height={size}
        onError={() => setFailedUrl(url)}
      />
    );
  }
  const { text } = plateColours(colours);
  return (
    <svg className="crest nt-crest" role="img" aria-label={label} viewBox="0 0 46 54" width={(size * 46) / 54} height={size}>
      <path d="M3 3h40v24c0 13-9 20-20 24C12 47 3 40 3 27z" fill={colours.primary} stroke={colours.secondary} strokeWidth="3" />
      <path d="M3 15h40v7H3z" fill={colours.secondary} opacity=".85" />
      <text x="23" y="38" textAnchor="middle" fontFamily="Archivo" fontWeight="900" fontSize="13" fill={text}>
        {code}
      </text>
    </svg>
  );
}
