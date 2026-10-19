import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { MatchView } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage, PagePlayer } from "@boleiro/game-client/matchPage/matchPageOf";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";
import { pitchSpots } from "../round/pitchSpots.js";
import { formatMark, markClass, shortName } from "./matchMarks.js";

const LINE_ORDER: Record<PositionGroup, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
// The pitch's lines are drawn 200 units long; its height in those units follows each size's frame, so the centre circle stays round.
const PITCH_HEIGHT = { panel: 101, full: 128 } as const;
// Shirts keep this far in from the touchlines, in percent, so a keeper's name stays on the pitch.
const INSET = 4;

type Props = { page: MatchPage; view: MatchView; size: "panel" | "full" };

/**
 * Both elevens on one pitch, home attacking left to right, each player where his side's formation
 * puts him: the one on the pitch at the minute shown, with his goals and cards, and his mark once the
 * match is over.
 */
export function MatchPitch({ page, view, size }: Props) {
  const spotsOf = (side: Side) => {
    const own = page[side];
    const byId = new Map([...own.starters, ...own.bench].map((p) => [p.id, p]));
    // A substitute takes the spot of the player he came on for.
    const spots = pitchSpots(own.starters, own.formation);
    for (const e of view.events) {
      if (e.kind !== "substitution" || e.side !== side || !e.otherId) continue;
      const spot = spots.get(e.otherId);
      if (spot) spots.set(e.playerId, spot);
    }
    return view.onPitch[side].flatMap((id) => {
      const player = byId.get(id);
      const spot = spots.get(id);
      if (!player || !spot) return [];
      // Home attacks to the right; the away side mirrors it from the other goal.
      const x = INSET + (side === "home" ? spot.x / 2 : 100 - spot.x / 2) * (1 - 2 * INSET / 100);
      const y = INSET + (side === "home" ? spot.y : 100 - spot.y) * (1 - 2 * INSET / 100);
      return [{ player, x, y, side }];
    });
  };
  const players = [...spotsOf("home"), ...spotsOf("away")];
  const goals = (id: string) => view.events.filter((e) => e.kind === "goal" && e.goalKind !== "ownGoal" && e.playerId === id).length;
  const card = (id: string) => (view.events.some((e) => e.kind === "red" && e.playerId === id) ? "rc" : view.events.some((e) => e.kind === "yellow" && e.playerId === id) ? "yc" : null);
  return (
    <div className={`mp-pitch ${size}`} role="img" aria-label={`Escalações: ${page.home.club.shortName} no ${page.home.formation}, ${page.away.club.shortName} no ${page.away.formation}`}>
      <PitchLines height={PITCH_HEIGHT[size]} />
      {players.map(({ player, x, y, side }) => {
        const rating = view.ratings?.[player.id];
        return (
          <span
            key={player.id}
            className={`mp-man ${side}${player.id === view.bestPlayerId ? " best" : ""}`}
            style={{ left: `${x}%`, top: `${y}%`, ["--i" as string]: LINE_ORDER[player.group] * 3 + (side === "away" ? 1 : 0), ["--kit" as string]: `var(--${side})`, ["--kit-ink" as string]: `var(--${side}-ink)` }}
          >
            <span className="mp-disc" title={player.name}>
              {size === "panel" ? initialsOf(player) : (rating !== undefined ? formatMark(rating) : initialsOf(player))}
            </span>
            {size === "panel" && rating !== undefined && <span className={markClass(rating)}>{formatMark(rating)}</span>}
            {size === "full" && <span className="mp-name">{shortName(player.name)}</span>}
            {goals(player.id) > 0 && (
              <span className="mp-goal" aria-label={`${goals(player.id)} gol`}>
                <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
                {goals(player.id) > 1 && goals(player.id)}
              </span>
            )}
            {card(player.id) && <span className={`mp-card ${card(player.id)}`} aria-hidden="true" />}
          </span>
        );
      })}
    </div>
  );
}

function initialsOf(player: PagePlayer): string {
  const words = player.name.split(/\s+/).filter(Boolean);
  const [first = "", second] = words;
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/** The pitch's markings, a pitch 105 by 68 metres drawn to the frame's height. */
function PitchLines({ height }: { height: number }) {
  const box = (depth: number, width: number, x: number) => <rect x={x} y={(height - width) / 2} width={depth} height={width} />;
  return (
    <svg className="mp-lines" viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="196" height={height - 4} rx="2" />
      <line x1="100" y1="2" x2="100" y2={height - 2} />
      <circle cx="100" cy={height / 2} r="17" />
      {box(31, height * 0.59, 2)}
      {box(31, height * 0.59, 167)}
      {box(10, height * 0.27, 2)}
      {box(10, height * 0.27, 188)}
    </svg>
  );
}
