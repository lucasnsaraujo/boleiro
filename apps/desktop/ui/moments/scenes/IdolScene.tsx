import { useRef, type CSSProperties, type ReactNode } from "react";
import type { IdolView } from "@boleiro/game-client/moments/momentView";
import { MomentStage, useCueAt, useTick } from "../MomentStage.js";
import { MomentSticker } from "../MomentSticker.js";
import { ease, span } from "../paperMotion.js";
import "./idol.css";

type Props = { view: IdolView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
const LEDGER_FROM = 500;
const LEDGER_UNTIL = 2700;
const IDOL_AT = 80;

function IdolBody({ view }: Pick<Props, "view">) {
  const gap = Math.min(360, (LEDGER_UNTIL - LEDGER_FROM) / Math.max(1, view.ledger.length));
  const steps = view.ledger.reduce<{ at: number; to: number }[]>((all, row, index) => [...all, { at: LEDGER_FROM + index * gap, to: (all.at(-1)?.to ?? 0) + row.points }], []);
  const value = useRef<HTMLElement>(null);
  const fill = useRef<HTMLElement>(null);
  useTick((t) => {
    let shown = 0;
    steps.forEach((step, index) => {
      const from = index ? (steps[index - 1]?.to ?? 0) : 0;
      shown += (step.to - from) * ease.out(span(t, step.at + 120, 420));
    });
    const meter = Math.max(0, Math.min(100, shown));
    if (value.current) value.current.textContent = String(Math.round(meter));
    if (fill.current) {
      fill.current.style.width = `${meter}%`;
      fill.current.classList.toggle("over", meter >= IDOL_AT);
    }
  });
  useCueAt("promotion", 3000);
  const coach = view.idols.at(-1);
  return (
    <>
      <div className="id-page">
        <section className="id-lt">
          <div className="when">
            <i className="ph-bold ph-star" />
            {view.when}
          </div>
          <div className="id-hl">
            <h2>A torcida está fazendo a conta</h2>
            <h1>
              Você virou ídolo do <span style={{ color: view.club.colours.primary }}>{view.club.name}</span>
            </h1>
          </div>
          {coach && (
            <div className="id-big">
              <div className="id-flip">
                <MomentSticker sticker={{ ...coach, isShiny: false, caption: `técnico · desde ${view.since}` }} className="plain" crest={30} />
                <MomentSticker sticker={{ ...coach, caption: `ídolo · ${view.when.split(" · ")[0]}` }} className="face" crest={30} sheenAt={3400} />
              </div>
              <div className="id-stamp">
                <div>
                  <b>ÍDOLO</b>
                  <small>
                    figurinha
                    <br />
                    brilhante
                  </small>
                </div>
              </div>
            </div>
          )}
          <div className="id-gauge">
            <div className="top">
              <span className="lbl">Você com a torcida do {view.club.name}</span>
              <b ref={value}>0</b>
            </div>
            <div className="gbar">
              <i ref={fill} />
              <span className="line">
                <span>ídolo · {IDOL_AT}</span>
              </span>
            </div>
            <small>Sobe com anos de casa, títulos e clássicos vencidos. Cai quando você pede para sair ou vai para o rival.</small>
          </div>
        </section>

        <section className="id-rt">
          <div className="id-sec">
            <h3>Como você chegou lá</h3>
            <span>{view.monthsAtClub} meses de clube</span>
          </div>
          <div className="id-led">
            {view.ledger.map((row, index) => (
              <div key={`${row.title}-${index}`} className={`id-row${index === view.ledger.length - 1 ? " cross" : ""}`} style={ms(steps[index]?.at ?? 0)}>
                <span className="ic">
                  <i className={`ph-fill ph-${row.icon}`} />
                </span>
                <span>
                  <b>{row.title}</b> <small>{row.detail}</small>
                </span>
                <span />
                <span className={`pts${row.points < 0 ? " neg" : ""}`}>{row.points > 0 ? `+${row.points}` : row.points}</span>
              </div>
            ))}
          </div>
          <div className="id-sec mo-up" style={{ ...ms(3600), marginTop: 16 }}>
            <h3>O que muda</h3>
          </div>
          <div className="id-chg">
            {view.rivals.length > 0 && (
              <div style={ms(3700)}>
                <i className="ph-fill ph-x" />
                <span>
                  <b>{view.rivals.join(", ")}</b> não te fazem proposta, e as torcidas deles vaiam você na casa delas.
                </span>
              </div>
            )}
            <div style={ms(3850)}>
              <i className="ph-fill ph-door-open" />
              <span>
                <b>Saindo bem, tem despedida.</b> E homenagem quando voltar como visitante.
              </span>
            </div>
            <div style={ms(4000)}>
              <i className="ph-fill ph-handshake" />
              <span>
                <b>A porta fica aberta.</b> Se a vaga abrir, o {view.club.name} procura você primeiro.
              </span>
            </div>
          </div>
          <div className="id-idols">
            {view.idols.map((sticker, index) => (
              <MomentSticker key={sticker.id} sticker={sticker} className={index === view.idols.length - 1 ? "you" : ""} crest={index === view.idols.length - 1 ? 14 : undefined} />
            ))}
            <span className="lbl2">Página de ídolos do seu álbum do {view.club.name}.</span>
          </div>
          <div className="cause mo-up" style={{ ...ms(5000), marginTop: 10 }}>
            <b>Por quê</b>
            <span>{view.cause}</span>
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * "Você virou ídolo": the fans' ledger lands line by line and fills the meter past the idol line, the coach's
 * sticker turns over and comes back foil, and a copy of it flies into the club's idols row.
 */
export function IdolScene({ view, actions }: Props) {
  return (
    <MomentStage durationMs={5800} backdrop="var(--paper) var(--paper-tex) center / cover" tone="light" label={`Você virou ídolo do ${view.club.name}`} className="mo-idol" actions={actions}>
      <IdolBody view={view} />
    </MomentStage>
  );
}
