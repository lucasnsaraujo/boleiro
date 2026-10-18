import { useRef, type CSSProperties, type ReactNode } from "react";
import type { ComeBackView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage, useCanvasTick, useCueAt, useTick } from "../MomentStage.js";
import { crestClub, MomentSticker } from "../MomentSticker.js";
import { ease, span, type Surface, type Tick } from "../paperMotion.js";
import "./comeBack.css";

type Props = { view: ComeBackView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;

/**
 * The paper's photo printed as halftone: the training ground's wall with the fans' banner, the dots growing from
 * top to bottom as the print develops.
 */
function halftone({ g, w, h }: Surface, banner: string): Tick {
  const cell = 5;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  let shades: number[] | null = null;
  const scene = () => {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return [];
    const sky = o.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#D8D8D8");
    sky.addColorStop(1, "#9A9A9A");
    o.fillStyle = sky;
    o.fillRect(0, 0, w, h);
    o.fillStyle = "#5A5A5A";
    for (let i = 0; i < 9; i++) o.fillRect((i * w) / 8 - 20, h * 0.12 + (i % 3) * 6, 46, h);
    o.fillStyle = "#7A7A7A";
    o.fillRect(0, h * 0.42, w, h * 0.58);
    o.fillStyle = "#4A4A4A";
    for (let x = 0; x < w; x += 34) o.fillRect(x, h * 0.42, 3, h);
    o.save();
    o.translate(w * 0.5, h * 0.52);
    o.rotate(-0.03);
    o.fillStyle = "#F4F4F4";
    o.fillRect(-w * 0.4, -32, w * 0.8, 64);
    o.fillStyle = "#161616";
    o.font = "900 condensed 44px Archivo";
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.fillText(banner, 0, 3, w * 0.76);
    o.restore();
    o.fillStyle = "#2A2A2A";
    for (let i = 0; i < 26; i++) {
      const x = 14 + i * (w / 26);
      const y = h * 0.8 + (i % 4) * 5;
      o.beginPath();
      o.arc(x, y, 9, 0, 6.28);
      o.fill();
      o.fillRect(x - 11, y + 6, 22, h);
    }
    const data = o.getImageData(0, 0, w, h).data;
    const found: number[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) found.push(1 - (data[(Math.min(h - 1, y * cell + 2) * w + Math.min(w - 1, x * cell + 2)) * 4] ?? 255) / 255);
    return found;
  };
  return (t) => {
    shades ??= scene();
    g.fillStyle = "#ECE5D2";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1A1A17";
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const developed = ease.out(span(t, 700 + (y / rows) * 500, 1100));
        const r = Math.sqrt(shades[y * cols + x] ?? 0) * cell * 0.62 * developed;
        if (r < 0.3) continue;
        g.beginPath();
        g.arc(x * cell + cell / 2 + (y % 2 ? cell / 2 : 0), y * cell + cell / 2, r, 0, 6.283);
        g.fill();
      }
  };
}

/** A former club calling its idol back: the fans' campaign on the front page, what the game knows of him and the crisis, and the written offer. */
export function ComeBackScene({ view, actions }: Props) {
  const photo = useCanvasTick((surface) => halftone(surface, view.banner));
  const posts = useRef<HTMLElement>(null);
  const crisis = useRef<HTMLSpanElement>(null);
  const crisisBar = useRef<HTMLElement>(null);
  const countTo = view.campaign[0]?.countTo ?? 0;
  useTick((t) => {
    if (posts.current) posts.current.textContent = `${Math.round(countTo * ease.out(span(t, 1900, 1600)))} mil`;
    const value = view.crisis * ease.out(span(t, 3000, 900));
    if (crisis.current) crisis.current.textContent = String(Math.round(value));
    if (crisisBar.current) crisisBar.current.style.width = `${value}%`;
  });
  useCueAt("comeback", 450);
  return (
    <MomentStage durationMs={5600} backdrop="var(--paper)" tone="light" label={`O ${view.club.name} pede a sua volta`} className="mo-comeback" actions={actions}>
      <article className="jb cb-paper">
        <div className="mast">
          <h4>
            <span>Jornal do</span>Boleiro
          </h4>
          <small>{view.masthead}</small>
        </div>
        <div className="cb-dl">
          <span>{view.strap[0]}</span>
          <span>{view.strap[1]}</span>
        </div>
        <div className="kick">A torcida escolheu</div>
        <h3>{view.headline}</h3>
        <p className="deck">{view.deck}</p>
        <figure className="cb-photo">
          <canvas ref={photo} />
          <figcaption>No muro do CT, de manhã cedo. Foto: Jornal do Boleiro</figcaption>
        </figure>
        <div className="cb-cols">
          {view.side.map((item) => (
            <div key={item.headline}>
              <h5>{item.headline}</h5>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </article>
      <section className="cb-rt">
        <div className="cb-camp">
          {view.campaign.map((item, index) => (
            <div key={item.label} className="nst mo-slap" style={ms(1700 + index * 200)}>
              {item.countTo !== null ? <b ref={posts}>0 mil</b> : <b>{item.value}</b>}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="cb-why mo-up" style={ms(2900)}>
          <div>
            <span className="lbl">Ídolo do {view.club.name}</span>
            <b>
              {view.standing >= 100 ? "Máximo" : "Ídolo"}
              <span>{view.standing}</span>
            </b>
            <div className="meter thin">
              <i style={{ width: `${view.standing}%` }} />
            </div>
            <small>A torcida não esqueceu.</small>
          </div>
          <div>
            <span className="lbl">Crise no clube</span>
            <b>
              {view.crisis >= 70 ? "Alta" : view.crisis >= 40 ? "Média" : "Baixa"}
              <span ref={crisis}>0</span>
            </b>
            <div className="meter thin low">
              <i ref={crisisBar} style={{ width: 0 }} />
            </div>
            <small>{view.crisisNote}</small>
          </div>
        </div>
        <div className="cb-offer">
          <div className="hd">
            <Crest club={crestClub(view.club)} size={44} />
            <div>
              <div className="kind">
                <i className="ph-bold ph-handshake" />
                {view.offer ? "Proposta por escrito" : "A diretoria ainda não ligou"}
              </div>
              <h2>O {view.club.name} quer você de volta</h2>
            </div>
          </div>
          {view.offer && (
            <>
              <blockquote>{view.offer.letter}</blockquote>
              <div className="cb-terms">
                {view.offer.terms.map(([label, value, note]) => (
                  <div key={label}>
                    <span className="lbl">{label}</span>
                    <b>{value}</b>
                    <small>{note}</small>
                  </div>
                ))}
              </div>
            </>
          )}
          {view.reunions.length > 0 && (
            <div className="cb-back">
              <span className="lbl">Quem você reencontra</span>
              <div className="who">
                {view.reunions.map((sticker, index) => (
                  <MomentSticker key={sticker.id} sticker={sticker} className="mo-slap" style={ms(4300 + index * 120)} />
                ))}
              </div>
            </div>
          )}
          <div className="cb-foot">
            <p>{view.offer?.until ?? view.cause}</p>
          </div>
        </div>
      </section>
    </MomentStage>
  );
}
