import { rivalryOf, TOP_INTENSITY, type Rivalry } from "@boleiro/engine/sim/rivalries/rivalryOf";
import "./derbyBadge.css";

type Props = { rivalry: Rivalry; isNamed?: boolean };

/** A derby's sticker: "Clássico" (or the derby's name) in red, its intensity as pips out of five. */
export function DerbyBadge({ rivalry, isNamed = false }: Props) {
  const name = rivalry.name || "Clássico";
  const words = `${name}, rivalidade ${rivalry.intensity} de ${TOP_INTENSITY}`;
  return (
    <span className={`derby-badge i${rivalry.intensity}${isNamed ? " named" : ""}`} title={words} role="img" aria-label={words}>
      <b aria-hidden="true">{isNamed ? name : "Clássico"}</b>
      <span className="derby-pips" aria-hidden="true">
        {Array.from({ length: TOP_INTENSITY }, (_, level) => (
          <i key={level} className={level < rivalry.intensity ? "on" : undefined} />
        ))}
      </span>
    </span>
  );
}

/** The badge of the derby two clubs play, or nothing for an ordinary match. */
export function DerbyBadgeOf({ homeId, awayId, isNamed = false }: { homeId: string; awayId: string; isNamed?: boolean }) {
  const rivalry = rivalryOf(homeId, awayId);
  return rivalry ? <DerbyBadge rivalry={rivalry} isNamed={isNamed} /> : null;
}
