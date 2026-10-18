import type { CSSProperties, ReactNode } from "react";
import type { SendOffView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage, useCanvasTick, useCueAt } from "../MomentStage.js";
import { crestClub, MomentSticker } from "../MomentSticker.js";
import { clubPaper, crowd, ease, mosaic, mosaicFace, span } from "../paperMotion.js";
import "./sendOff.css";

type Props = { view: SendOffView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
const PITCH_TOP = 282;
// The coach's walk from the tunnel to the centre circle, in the pitch's own coordinates.
const WALK: [number, number][] = [
  [150, 512],
  [320, 398],
  [520, 266],
  [672, 212],
];
const pathOf = (dy: number) => {
  const [start, ...curve] = WALK.map(([x, y]) => `${x} ${y + dy}`);
  return `M ${start} C ${curve.join(", ")}`;
};
const WALK_PATH = pathOf(0);
const STAGE_PATH = pathOf(PITCH_TOP);

function pointAt(t: number): [number, number] {
  const [p0, p1, p2, p3] = WALK as [[number, number], [number, number], [number, number], [number, number]];
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
  return [x, y];
}

/** Two lines of the squad either side of the walk, smaller as they go away from the camera. */
function corridor(count: number): { left: number; top: number; scale: number; z: number; delay: number; tilt: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const step = Math.floor(index / 2);
    const f = 0.2 + step * 0.13;
    const side = index % 2 ? 1 : -1;
    const [ax, ay] = pointAt(f);
    const [bx, by] = pointAt(f + 0.01);
    const nx = -(by - ay);
    const ny = bx - ax;
    const scale = 1.08 - f * 0.6;
    const offset = (74 * scale) / Math.hypot(nx, ny);
    return { left: ax + nx * offset * side, top: PITCH_TOP + ay + ny * offset * side, scale, z: 20 - step, delay: 2900 + (5 - step) * 90 + (index % 2) * 40, tilt: side * 1.5 };
  });
}

/**
 * The send-off after a long, happy spell: the floodlights come on, the stand turns into a mosaic, the banner
 * unrolls, the squad forms a corridor and the coach walks it to the centre circle while the crowd stands up;
 * then the spell's numbers on the album page and the last sticker of the club's page.
 */
export function SendOffScene({ view, actions }: Props) {
  const firstName = (view.coachName.split(" ")[0] ?? view.coachName).toUpperCase();
  const stand = useCanvasTick((surface) => mosaic(surface, { cell: 7, at: 500, wave: 1900, flip: 320, back: "#2A1214", draw: mosaicFace(view.club.colours, [`OBRIGADO, ${firstName}`], 16, 3) }));
  const fans = useCanvasTick((surface) =>
    crowd(surface, {
      colours: [...clubPaper(view.club.colours), "#1A1A1A", "#2B2B2B"],
      gap: 7,
      rise: 4,
      shade: 0.35,
      stand: (t, x) => Math.max(0, Math.min(1, (ease.out(span(t, 4900, 1800)) * 0.62 - Math.abs(x - 0.53)) * 10)),
    }),
  );
  useCueAt("comeback", 3500);
  const spots = corridor(Math.min(12, view.squad.length));
  return (
    <MomentStage durationMs={7800} backdrop="#0E1712" tone="dark" label={`Despedida do ${view.club.name}`} className="mo-sendoff" actions={actions}>
      <div className="so-roof">
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={ms(40 + ((i * 7) % 36) * 22)} />
        ))}
      </div>
      <div className="so-upper">
        <canvas ref={stand} className="fill" />
      </div>
      <div className="so-lower">
        <canvas ref={fans} />
      </div>
      <div className="so-banner">
        <b>{view.banner}</b>
      </div>
      <div className="so-boards">
        {[...view.boards, ...view.boards, ...view.boards].map((text, index) => (
          <span key={index}>{text}</span>
        ))}
      </div>
      <div className="so-pitch">
        <svg viewBox="0 0 1280 438" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.5">
            <path d="M 0 20 H 1280" />
            <path d="M 652 20 L 700 438" />
            <ellipse cx="672" cy="210" rx="176" ry="66" />
            <circle cx="672" cy="210" r="4" fill="rgba(255,255,255,.7)" />
          </g>
          <mask id="so-mask">
            <path className="so-trail-mask" d={WALK_PATH} stroke="#fff" strokeWidth="8" fill="none" />
          </mask>
          <path className="so-trail" mask="url(#so-mask)" d={WALK_PATH} stroke="#FFCC00" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      {view.squad.slice(0, spots.length).map((sticker, index) => {
        const spot = spots[index];
        if (!spot) return null;
        return (
          <MomentSticker
            key={sticker.id}
            sticker={sticker}
            className="so-pl"
            showCaption={false}
            style={{ left: spot.left, top: spot.top, zIndex: spot.z, "--k": spot.scale.toFixed(2), "--r": `${spot.tilt}deg`, ...ms(spot.delay) } as CSSProperties}
          />
        );
      })}
      <MomentSticker sticker={view.coach} className="so-coach" crest={14} showCaption={false} style={{ offsetPath: `path('${STAGE_PATH}')` } as CSSProperties} />

      <div className="so-title">
        <div className="when">
          <i className="ph-bold ph-flag-banner" />
          {view.when} · {view.stadium}
        </div>
        <h1>{view.headline}</h1>
        <p>{view.story}</p>
        <div className="cause">
          <b>Por quê</b>
          <span>{view.cause}</span>
        </div>
      </div>

      <section className="so-pg">
        <div className="hd">
          <Crest club={crestClub(view.club)} size={40} />
          <div>
            <h2>
              {view.club.name} de {view.coachName}
            </h2>
            <small>{view.period}</small>
          </div>
        </div>
        <div className="so-nums">
          {view.numbers.map((number, index) => (
            <div key={number.label} className={`nst mo-slap${number.isFoil ? " foil" : ""}`} style={ms(5200 + index * 180)}>
              <b>{number.value}</b>
              <span>{number.label}</span>
            </div>
          ))}
        </div>
        {view.titles && (
          <p className="so-tits mo-fade" style={ms(6400)}>
            {view.titles}
          </p>
        )}
        <div className="so-last">
          <div className="slot">
            <MomentSticker sticker={{ ...view.coach, name: "Despedida", caption: "" }} className="so-stick" crest={14} sheenAt={7300} showCaption={false} />
          </div>
          <div>
            <b>Figurinha da despedida</b>
            <p>Fecha a página do {view.club.name} no seu álbum. A torcida guarda a dela.</p>
          </div>
        </div>
      </section>
      <div className="so-dim" />
    </MomentStage>
  );
}
