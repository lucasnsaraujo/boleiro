import { useRef, type CSSProperties, type ReactNode } from "react";
import type { TitleView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { strongColour } from "../clubTone.js";
import { competitionLogoOf } from "../../competitions/competitionLogos.js";
import { MomentStage, useCanvasTick, useCueAt, useTick } from "../MomentStage.js";
import { crestClub, MomentSticker } from "../MomentSticker.js";
import { clubPaper, confetti, crowd, ease, span } from "../paperMotion.js";
import "./title.css";

type Props = { view: TitleView; actions: ReactNode };

// The trophy card's logo slot, in CSS pixels: the card is 120 x 150.
const TROPHY_LOGO = 120;
const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;

function Trophy({ view, size }: { view: TitleView; size: "short" | "long" }) {
  const logo = competitionLogoOf(view.competition, view.season, TROPHY_LOGO, view.host);
  return (
    <div className={`tt-trophy is-${size}`}>
      <div className="tt-cup">
        <img src={logo.url} alt={view.competitionName} />
      </div>
      <div>
        <b>{view.headline}</b>
        <small>{view.subline}</small>
      </div>
    </div>
  );
}

/** The quick party: the trophy slaps in, the paper flies, the eleven lands and the paper prints the line. */
function ShortTitle({ view, k }: { view: TitleView; k: number }) {
  const paper = useCanvasTick((surface) => confetti(surface, { at: 250 * k, colours: [...clubPaper(view.club.colours), "#FFCC00"], count: 110, origin: [0.32, 0.36], spread: 0.95, speed: 900, seed: 3, life: 2600 * k + 600 }));
  const fans = useCanvasTick((surface) =>
    crowd(surface, { colours: [...clubPaper(view.club.colours), "#1A1A1A"], gap: 7, rise: 6, shade: 0.4, stand: (t, x) => Math.max(0, Math.min(1, (span(t, 500 * k, 700 * k) * 1.4 - Math.abs(x - 0.5)) * 4)) }),
  );
  useCueAt("title", 100 * k);
  return (
    <>
      <section className="tt-a">
        <div className="when mo-fade" style={ms(0)}>
          <i className="ph-bold ph-trophy" />
          {view.when}
        </div>
        <div className="tt-slap" style={ms(100 * k)}>
          <Trophy view={view} size="short" />
        </div>
        <div className="tt-xi">
          {view.eleven.map((sticker, index) => (
            <MomentSticker key={sticker.id} sticker={sticker} className="tt-xs" style={ms((350 + index * 40) * k)} showCaption={false} />
          ))}
        </div>
        <div className="cause mo-up" style={ms(1500 * k)}>
          <b>Por quê</b>
          <span>{view.cause}</span>
        </div>
      </section>
      <section className="tt-a-side">
        <div className="tt-seal mo-slap" style={ms(180 * k)}>
          <Crest club={crestClub(view.club)} size={132} />
        </div>
        <div className="tt-facts">
          {view.facts.map((fact, index) => (
            <div key={fact.label} className="nst mo-up" style={ms((900 + index * 90) * k)}>
              <b>{fact.value}</b>
              <span>{fact.label}</span>
            </div>
          ))}
        </div>
        <div className="tt-clip mo-up" style={ms(1200 * k)}>
          <small>Jornal do Boleiro · dia seguinte</small>
          <b>{view.clipping}</b>
        </div>
        <div className="tt-stand" style={{ ...ms(300 * k), "--strong": strongColour(view.club) } as CSSProperties}>
          <canvas ref={fans} />
          <span>A torcida do {view.club.name}</span>
        </div>
      </section>
      <canvas ref={paper} className="fill" />
    </>
  );
}

/** Where each near miss pins on the board, so the six never cover each other. */
const PHOTO_SPOTS: readonly [x: number, y: number, r: number][] = [
  [0, 0, -5],
  [150, 10, 4],
  [300, -6, -3],
  [450, 8, 6],
  [70, 168, -4],
  [240, 176, 3],
];

/** The long one: the drought counter runs, the near misses pin as it passes them, the tag tears, the night warms, the crowd stands, the veterans and "Finalmente". */
function LongTitle({ view, k }: { view: TitleView; k: number }) {
  const from = Math.min(view.drought.from, view.drought.to - 1);
  const to = view.drought.to;
  const length = 4800 * k;
  const start = 400 * k;
  const timeOf = (year: number) => {
    const target = (year - from) / (to - from);
    let low = 0;
    let high = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (ease.cubicInOut(mid) < target) low = mid;
      else high = mid;
    }
    return start + low * length;
  };
  const misses = new Set(view.nearMisses.map((miss) => miss.year));
  const year = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLElement>(null);
  useTick((t) => {
    const now = from + Math.round(ease.cubicInOut(span(t, start, length)) * (to - from));
    if (year.current) {
      year.current.textContent = String(now);
      year.current.classList.toggle("miss", misses.has(now));
    }
    if (count.current) count.current.textContent = String(now - from);
  });
  const strong = strongColour(view.club);
  const crowdCanvas = useCanvasTick((surface) =>
    crowd(surface, {
      colours: [...clubPaper(view.club.colours), "#2A0A0C"],
      gap: 7,
      rise: 5,
      shade: 0.5,
      stand: (t, x) => Math.max(0, Math.min(1, (span(t, 5800 * k, 1300 * k) * 1.3 - Math.abs(x - 0.3)) * 5)),
    }),
  );
  const paper = useCanvasTick((surface) => confetti(surface, { at: 6000 * k, colours: [...clubPaper(view.club.colours), "#FFCC00"], count: 200, origin: [0.22, 1.02], spread: 0.6, speed: 1500, seed: 9, life: 5200 }));
  useCueAt("comeback", 5900 * k);
  return (
    <section className="tt-b" style={{ "--strong": strong } as CSSProperties}>
      <div className="tt-warm" style={ms(5600 * k)} />
      <canvas ref={crowdCanvas} className="tt-crowd" />
      <div className="tt-drought">
        <div className="when">
          <i className="ph-bold ph-trophy" />
          {view.when}
        </div>
        <div className="tt-odo">
          <span ref={year} className="tt-yr">
            {from}
          </span>
          <div className="tt-n">
            <b ref={count}>0</b>
            {view.drought.label}
          </div>
        </div>
        <div className="tt-tag" style={ms(5300 * k)}>
          <div className="l">
            <span>{view.drought.tag}</span>
          </div>
          <div className="r">
            <span>{view.drought.tag}</span>
          </div>
        </div>
      </div>
      <div className="tt-champ" style={ms(5900 * k)}>
        <Trophy view={view} size="long" />
      </div>
      <div className="tt-photos">
        {view.nearMisses.slice(-PHOTO_SPOTS.length).map((miss, index) => {
          const [x, y, r] = PHOTO_SPOTS[index] ?? [0, 0, 0];
          return (
            <div key={`${miss.year}-${miss.label}`} className={`tt-ph${miss.isYours ? " you" : ""}`} style={{ ...ms(timeOf(miss.year)), left: x, top: y, "--r": `${r}deg` } as CSSProperties}>
              <div className="img">
                <b>{miss.year}</b>
              </div>
              <small>{miss.label}</small>
            </div>
          );
        })}
      </div>
      {view.veterans.length > 0 && (
        <div className="tt-vets mo-up" style={ms(6700 * k)}>
          <span className="lbl">Ficaram com você desde o começo</span>
          <div className="row">
            {view.veterans.map((sticker, index) => (
              <MomentSticker key={sticker.id} sticker={sticker} className="mo-slap" style={ms((6800 + index * 150) * k)} />
            ))}
          </div>
        </div>
      )}
      <article className="jb tt-fin" style={ms(8100 * k)}>
        <div className="mast">
          <h4>
            <span>Jornal do</span>Boleiro
          </h4>
          <small>{view.paper.masthead}</small>
        </div>
        <h3>{view.paper.headline}</h3>
        <p className="deck">{view.paper.deck}</p>
      </article>
      <div className="cause tt-b-cause mo-up" style={ms(8800 * k)}>
        <b>Por quê</b>
        <span>{view.cause}</span>
      </div>
      <canvas ref={paper} className="fill tt-conf" />
    </section>
  );
}

/**
 * A title, celebrated by its story: about 2 s and happy in a first season with nothing to wait for, up to
 * 10 s after years of waiting and near misses. The same trophy either way.
 */
export function TitleScene({ view, actions }: Props) {
  const k = view.isLong ? view.seconds / 9.8 : Math.max(1, view.seconds / 2);
  const duration = view.isLong ? 9800 * k : 2000 * k;
  return (
    <MomentStage
      durationMs={duration}
      backdrop={view.isLong ? `color-mix(in srgb, ${strongColour(view.club)} 40%, #050202)` : "var(--paper) var(--paper-tex) center / cover"}
      tone={view.isLong ? "dark" : "light"}
      label={view.headline.toLowerCase().includes(view.competitionName.toLowerCase()) ? view.headline : `${view.headline}: ${view.competitionName}`}
      className={`mo-title ${view.isLong ? "is-long" : "is-short"}`}
      actions={actions}
    >
      {view.isLong ? <LongTitle view={view} k={k} /> : <ShortTitle view={view} k={k} />}
    </MomentStage>
  );
}
