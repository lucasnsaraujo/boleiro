import type { CSSProperties, ReactNode } from "react";
import type { QuietExitView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage } from "../MomentStage.js";
import { crestClub } from "../MomentSticker.js";
import "./quietExit.css";

type Props = { view: QuietExitView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;

// A signature in one stroke, drawn as the letter ends.
const SIGNATURE =
  "M8 40 C 14 22, 18 8, 22 10 C 26 12, 16 38, 14 46 C 22 40, 30 34, 36 36 C 40 38, 34 46, 40 44 C 46 42, 48 34, 52 36 C 56 38, 50 46, 56 44 C 62 42, 66 34, 70 36 C 66 38, 62 46, 70 44 C 74 42, 78 36, 82 38 C 86 40, 80 46, 88 42 M 104 46 C 110 30, 116 14, 122 12 C 126 12, 124 30, 128 44 M 112 32 C 118 30, 124 30, 130 31 C 136 32, 132 44, 140 42 C 144 40, 146 34, 150 36 C 146 40, 148 46, 154 42 C 158 38, 162 34, 166 38 C 162 44, 168 46, 172 40 C 174 36, 176 48, 172 54 M 180 38 C 186 36, 190 40, 186 44 C 182 48, 178 40, 184 38 C 190 36, 196 34, 202 30";

function QuietExitBody({ view }: Pick<Props, "view">) {
  return (
    <>
      <div className="qe-desk" />
      <article className="qe-letter">
        <div className="hd">
          <Crest club={crestClub(view.club)} size={26} />
          {view.place}
        </div>
        {view.paragraphs.map((line, index) => (
          <p key={line} className="ln" style={ms(900 + index * 650)}>
            {line}
          </p>
        ))}
        <svg className="qe-sig" width="210" height="58" viewBox="0 0 210 58" fill="none" stroke="#23251F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={SIGNATURE} />
        </svg>
        <div className="nm">{view.coachName}</div>
      </article>
      <section className="qe-side">
        <div className="when">
          <Crest club={crestClub(view.club)} size={18} />
          {view.club.name} · {view.period}
        </div>
        <dl>
          {view.facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <aside className="qe-foot">
        <small>
          <span>Jornal do Boleiro</span>
          <span>{view.footnote.date}</span>
        </small>
        {view.footnote.items.map((item) => (
          <div key={item.headline} className={item.isYours ? "it me" : "it"}>
            <b>{item.headline}</b>
            {item.body}
          </div>
        ))}
      </aside>
      <div className="cause qe-cause">
        <b>Por quê</b>
        <span>{view.cause}</span>
      </div>
    </>
  );
}

/** A quiet exit: a short letter that inks in and is signed, the spell's numbers, and a footnote on page 9. No crowd, no stickers. */
export function QuietExitScene({ view, actions }: Props) {
  return (
    <MomentStage durationMs={5200} backdrop="var(--paper) var(--paper-tex) center / cover" tone="light" label={`Saída do ${view.club.name}`} className="mo-quiet" actions={actions}>
      <QuietExitBody view={view} />
    </MomentStage>
  );
}
