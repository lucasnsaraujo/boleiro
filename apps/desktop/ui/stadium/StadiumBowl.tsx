const SECTORS = 28;
const CENTRE = { x: 200, y: 140 };
const OUTER = { x: 186, y: 128 };
const INNER = { x: 128, y: 80 };
/** The away end, at the bottom of the bowl as the mock draws it. */
const AWAY_SECTOR = 6;
const GAP = 0.02;
// Home sectors fill in this order, spread round the bowl so a half-full ground looks half full everywhere.
const FILL_ORDER = Array.from({ length: SECTORS }, (_, i) => i)
  .filter((i) => i !== AWAY_SECTOR)
  .sort((a, b) => ((a * 11) % SECTORS) - ((b * 11) % SECTORS));
const HOME_SECTORS = FILL_ORDER.length;

const point = (rx: number, ry: number, angle: number) => `${(CENTRE.x + rx * Math.cos(angle)).toFixed(1)} ${(CENTRE.y + ry * Math.sin(angle)).toFixed(1)}`;

function sectorPath(index: number): string {
  const from = (index / SECTORS) * Math.PI * 2 + GAP;
  const to = ((index + 1) / SECTORS) * Math.PI * 2 - GAP;
  return `M${point(INNER.x, INNER.y, from)} L${point(OUTER.x, OUTER.y, from)} A${OUTER.x} ${OUTER.y} 0 0 1 ${point(OUTER.x, OUTER.y, to)} L${point(INNER.x, INNER.y, to)} A${INNER.x} ${INNER.y} 0 0 0 ${point(INNER.x, INNER.y, from)}Z`;
}

const PATHS = Array.from({ length: SECTORS }, (_, i) => sectorPath(i));

type Props = {
  /** Share of the seats the forecast fills, 0 to 1. */
  share: number;
  /** The visitors' colour, for the away end; none without a game. */
  visitorColour: string | null;
};

/** The ground from above, its stands filled as far as the forecast crowd goes. */
export function StadiumBowl({ share, visitorColour }: Props) {
  const filled = Math.max(0, Math.min(1, share)) * HOME_SECTORS;
  const fillOf = (index: number): number => {
    const rank = FILL_ORDER.indexOf(index);
    return Math.max(0, Math.min(1, filled - rank));
  };
  return (
    <svg className="std-bowl" viewBox="0 0 400 292" role="img" aria-label={`Estádio ${Math.round(share * 100)}% cheio`}>
      <defs>
        <clipPath id="std-pitch">
          <rect x={CENTRE.x - 84} y={CENTRE.y - 52} width="168" height="104" rx="3" />
        </clipPath>
      </defs>
      <ellipse cx={CENTRE.x} cy={CENTRE.y + 6} rx={OUTER.x + 6} ry={OUTER.y + 6} className="std-bowl-shadow" />
      <ellipse cx={CENTRE.x} cy={CENTRE.y} rx={OUTER.x + 6} ry={OUTER.y + 6} className="std-bowl-rim" />
      {PATHS.map((d, index) => {
        if (index === AWAY_SECTOR) return <path key={index} d={d} className="std-sector away" style={visitorColour ? { fill: visitorColour } : undefined} />;
        const fill = fillOf(index);
        const rank = FILL_ORDER.indexOf(index);
        return (
          <g key={index} className="std-sector-g" style={{ transitionDelay: `${rank * 14}ms` }}>
            <path d={d} className="std-sector empty" />
            <path d={d} className="std-sector full" style={{ opacity: fill, transitionDelay: `${rank * 14}ms` }} />
          </g>
        );
      })}
      <ellipse cx={CENTRE.x} cy={CENTRE.y} rx={INNER.x - 4} ry={INNER.y - 4} className="std-grass" />
      <g clipPath="url(#std-pitch)">
        {Array.from({ length: 8 }, (_, k) => (
          <rect key={k} x={CENTRE.x - 84 + k * 21} y={CENTRE.y - 52} width="21" height="104" className={k % 2 ? "std-stripe" : "std-stripe light"} />
        ))}
      </g>
      <g className="std-lines">
        <rect x={CENTRE.x - 80} y={CENTRE.y - 48} width="160" height="96" />
        <line x1={CENTRE.x} y1={CENTRE.y - 48} x2={CENTRE.x} y2={CENTRE.y + 48} />
        <circle cx={CENTRE.x} cy={CENTRE.y} r="14" />
        <rect x={CENTRE.x - 80} y={CENTRE.y - 22} width="22" height="44" />
        <rect x={CENTRE.x + 58} y={CENTRE.y - 22} width="22" height="44" />
      </g>
    </svg>
  );
}
