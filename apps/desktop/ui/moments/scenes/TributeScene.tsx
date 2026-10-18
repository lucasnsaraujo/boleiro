import { useRef, type CSSProperties, type ReactNode } from "react";
import type { TributeView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage, useCanvasTick, useCueAt, useTick } from "../MomentStage.js";
import { crestClub } from "../MomentSticker.js";
import { clubPaper, crowd, ease, mosaic, mosaicFace, readableOn, span } from "../paperMotion.js";
import "./tribute.css";

type Props = { view: TributeView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
const SHIRT = "M60 14 L84 6 Q110 22 136 6 L160 14 L210 46 L190 92 L168 80 L168 222 L52 222 L52 80 L30 92 L10 46 Z";
const KIND_WORDS: Record<TributeView["kind"], { icon: string; label: string }> = {
  milestone: { icon: "medal", label: "Marca" },
  homecoming: { icon: "users-four", label: "Volta como visitante" },
  idolRetired: { icon: "t-shirt", label: "Ídolo se despede" },
};

/** The framed shirt, its number counting up to the milestone. */
function FramedShirt({ view }: { view: TributeView }) {
  const number = useRef<SVGTextElement>(null);
  useTick((t) => {
    if (number.current) number.current.textContent = String(Math.round(1 + (view.count - 1) * ease.out(span(t, 900, 1500))));
  });
  const ink = readableOn(view.club.colours.primary, view.club.colours.secondary);
  return (
    <div className="tr-frame">
      <div className="mat">
        <svg viewBox="0 0 220 230" aria-hidden="true">
          <path d={SHIRT} fill={view.club.colours.primary} />
          <path d="M84 6 Q110 22 136 6 L130 4 Q110 16 90 4 Z" fill={view.club.colours.secondary} />
          <path d="M10 46 L30 92 L40 86 L22 42 Z M210 46 L190 92 L180 86 L198 42 Z" fill={view.club.colours.secondary} opacity=".9" />
          <path d={SHIRT} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
          <text x="110" y="86" textAnchor="middle" fill={ink} fontFamily="Archivo" fontWeight="900" fontSize="16" letterSpacing="2" style={{ fontStretch: "125%" }}>
            {view.shirtName.slice(0, 12)}
          </text>
          <text ref={number} x="110" y="176" textAnchor="middle" fill={ink} fontFamily="Archivo" fontWeight="900" fontSize="54" style={{ fontStretch: "112%" }}>
            1
          </text>
        </svg>
      </div>
    </div>
  );
}

function TributeBody({ view }: Pick<Props, "view">) {
  const seconds = useRef<HTMLElement>(null);
  useTick((t) => {
    if (!seconds.current) return;
    const s = Math.round(span(t, 2700, 1800) * 60);
    seconds.current.textContent = s >= 60 ? "1:00" : `0:${String(s).padStart(2, "0")}`;
  });
  const stand = useCanvasTick((surface) => mosaic(surface, { cell: 5, at: 1800, wave: 900, flip: 260, back: "#2A1214", direction: (x) => 1 - x, draw: mosaicFace(view.club.colours, [view.mosaic], 15, 2, 0.4) }));
  const fans = useCanvasTick((surface) =>
    crowd(surface, { colours: [...clubPaper(view.club.colours), "#1A1A1A"], gap: 6, rise: 4, shade: 0.3, stand: (t, x) => Math.max(0, Math.min(1, (span(t, 2600, 900) * 1.4 - Math.abs(x - 0.4)) * 6)) }),
  );
  useCueAt("comeback", 2600);
  const words = KIND_WORDS[view.kind];
  return (
    <>
      <div className="tr-spread">
        <section className="tr-pl">
          <div className="tr-kind">
            <i className={`ph-fill ph-${words.icon}`} style={{ color: view.club.colours.primary }} />
            {words.label} · {view.when}
          </div>
          <h2>{view.headline}</h2>
          <p className="tr-sub">{view.story}</p>
          <div className="tr-body">
            <FramedShirt view={view} />
            <div className="tr-facts">
              {view.facts.map((fact, index) => (
                <div key={fact.label} className={`nst mo-slap${fact.isFoil ? " foil" : ""}`} style={ms(1500 + index * 150)}>
                  <b>{fact.value}</b>
                  <span>{fact.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cause tr-cause mo-up" style={ms(2400)}>
            <b>Por quê</b>
            <span>{view.cause}</span>
          </div>
        </section>
        <section className="tr-pr">
          <div className="tr-kind">
            <Crest club={crestClub(view.club)} size={18} />
            {view.club.name}
          </div>
          <div className="tr-band">
            <canvas ref={stand} className="tr-mos" />
            <canvas ref={fans} className="tr-crowd" />
            <div className="tr-ring">
              <svg viewBox="0 0 106 106" aria-hidden="true">
                <circle cx="53" cy="53" r="50" fill="none" stroke="#E9DFC9" strokeWidth="5" />
                <circle className="f" cx="53" cy="53" r="50" fill="none" stroke={view.club.colours.primary === "#FFFFFF" ? "#14231A" : view.club.colours.primary} strokeWidth="5" strokeLinecap="round" />
              </svg>
              <div>
                <b ref={seconds}>0:00</b>
                <small>
                  minuto de
                  <br />
                  aplausos
                </small>
              </div>
            </div>
          </div>
          <div className="plaque tr-plq">
            <div className="eng">
              <Crest club={crestClub(view.club)} size={30} />
              <b>{view.plaque.name}</b>
              <span>{view.plaque.text}</span>
              <small>{view.plaque.signed}</small>
            </div>
          </div>
          <div className="tr-res">
            {view.result && view.opponent && (
              <div>
                <b>
                  <Crest club={crestClub(view.club)} size={18} />
                  {view.result}
                  <Crest club={crestClub(view.opponent)} size={18} />
                </b>
                O jogo com o seu {view.opponent.name}. Nenhuma vaia quando você foi à beira do campo.
              </div>
            )}
            <div>
              <b>
                <i className="ph-fill ph-star" style={{ color: "var(--yellow-d)" }} />
                Ídolo do {view.club.name}: {view.standing}
              </b>
              {view.standing >= 80 ? "Se a vaga abrir, o clube procura você primeiro." : "A torcida guarda a lembrança."}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * A tribute: a club's milestone for its coach, a former club applauding him as the visitor, or an idol of his
 * squad hanging up his boots. The framed shirt counts up, the stand flips its mosaic and stands for the minute
 * of applause, and the plaque is engraved.
 */
export function TributeScene({ view, actions }: Props) {
  return (
    <MomentStage durationMs={6400} backdrop="var(--paper) var(--paper-tex) center / cover" tone="light" label={view.headline} className="mo-tribute" actions={actions}>
      <TributeBody view={view} />
    </MomentStage>
  );
}
