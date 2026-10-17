import { plateColours } from "../clubs/clubCatalog.js";

type Props = { code: string; colours: { primary: string; secondary: string }; size?: number; label?: string };

/** A national team as a die-cut shield in its kit colours with its FIFA code, the way the album prints a club without a badge. */
export function NationalCrest({ code, colours, size = 32, label = code }: Props) {
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
