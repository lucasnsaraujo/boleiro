import { useRef, type CSSProperties, type ReactNode } from "react";
import type { SackingView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { strongColour } from "../clubTone.js";
import { MomentStage, useCueAt, useTick } from "../MomentStage.js";
import { crestClub } from "../MomentSticker.js";
import { ease, span } from "../paperMotion.js";
import "./sacking.css";

type Props = { view: SackingView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
const RESULT_MS = 210;
const FIRST_RESULT_MS = 200;

/** "21h40" in minutes after midnight, past midnight counted on (0h47 is 24 h 47). */
function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split("h").map(Number);
  return (hours < 12 ? hours + 24 : hours) * 60 + minutes;
}

const clockText = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The board's and the fans' meters falling result by result. */
function Pressure({ view }: { view: SackingView }) {
  const boardValue = useRef<HTMLSpanElement>(null);
  const boardBar = useRef<HTMLElement>(null);
  const fansValue = useRef<HTMLElement>(null);
  const fansBar = useRef<HTMLElement>(null);
  useTick((t) => {
    let board = view.startBoard;
    let fans = view.startFans;
    view.run.forEach((result, index) => {
      const p = ease.out(span(t, FIRST_RESULT_MS + 100 + index * RESULT_MS, 380));
      const before = view.run[index - 1];
      board += (result.board - (before ? before.board : view.startBoard)) * p;
      fans += (result.fans - (before ? before.fans : view.startFans)) * p;
    });
    if (boardValue.current) boardValue.current.textContent = String(Math.round(board));
    if (boardBar.current) boardBar.current.style.width = `${board}%`;
    if (fansValue.current) fansValue.current.textContent = String(Math.round(fans));
    if (fansBar.current) fansBar.current.style.width = `${fans}%`;
  });
  return (
    <>
      <div className="sk-meter-row">
        <span className="lbl">Confiança da diretoria</span>
        <span ref={boardValue} className="sk-big">
          {view.startBoard}
        </span>
        <div className="meter low">
          <i ref={boardBar} style={{ width: `${view.startBoard}%` }} />
        </div>
      </div>
      <div className="sk-fans">
        <span>Torcida</span>
        <div className="meter thin">
          <i ref={fansBar} style={{ width: `${view.startFans}%` }} />
        </div>
        <b ref={fansValue}>{view.startFans}</b>
      </div>
    </>
  );
}

function Stadium({ name }: { name: string }) {
  const ribs = Array.from({ length: 21 }, (_, i) => {
    const x = 10 + i * 20;
    const y = 92 - Math.sin((i / 20) * Math.PI) * 26;
    return <path key={i} d={`M ${x} ${y} L ${x} 110`} />;
  });
  return (
    <svg className="sk-stadium" viewBox="0 0 420 124" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="#2E4A3A" strokeWidth="2">
        <path d="M 10 92 Q 210 40 410 92" />
        <path d="M 10 92 L 10 110 L 410 110 L 410 92" />
        {ribs}
      </g>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} className={i > 2 && i < 6 ? "sk-win" : undefined} x={160 + i * 11} y={98} width={7} height={6} fill="#22362A" />
      ))}
      <text x="210" y="121" fill="#3E5C48" fontSize="9" fontWeight="800" textAnchor="middle" letterSpacing="2">
        {name.toUpperCase()}
      </text>
    </svg>
  );
}

/**
 * The night sacking, played out: the losing run flips in and the meters fall, the clippings pin on, the phone
 * wakes while the board meets at night, the note lands past midnight, and dawn turns into the next day's paper
 * and the fans' reaction.
 */
export function SackingScene({ view, actions }: Props) {
  const clock = useRef<HTMLElement>(null);
  const from = minutesOf(view.night[0]?.time ?? "21h40");
  const to = minutesOf(view.night.at(-1)?.time ?? "0h47");
  useTick((t) => {
    if (clock.current) clock.current.textContent = clockText(from + Math.round(ease.out(span(t, 2500, 1100)) * (to - from)));
  });
  useCueAt("sacked", 3600);
  const strong = strongColour(view.club);
  const clipSpots: [number, number, number][] = [
    [0, 4, -2],
    [30, 116, 1.6],
    [8, 228, -1],
  ];
  return (
    <MomentStage durationMs={7400} backdrop="#0A1610" tone="dark" label={`Demitido: ${view.club.name}`} className="mo-sack" actions={actions}>
      <section className="sk-pres">
        <div className="when">
          <i className="ph-bold ph-trend-down" />
          {view.place}
        </div>
        <h2>{view.headline}</h2>
        <div className="sk-run">
          {view.run.map((result, index) => (
            <div key={index} className={`sk-r${result.result === "D" ? " d" : result.result === "V" ? " v" : ""}${result.isDerby ? " derby" : ""}`} style={ms(FIRST_RESULT_MS + index * RESULT_MS)}>
              <b>{result.result}</b>
              <Crest club={crestClub(result.opponent)} size={18} />
              <small>{result.score}</small>
            </div>
          ))}
        </div>
        <Pressure view={view} />
        <div className="sk-clips">
          {view.clippings.map((clip, index) => {
            const [left, top, r] = clipSpots[index] ?? [0, 0, 0];
            return (
              <div key={clip.headline} className="sk-clip" style={{ ...ms(1700 + index * 380), left, top, "--r": `${r}deg` } as CSSProperties}>
                <span className="tape" />
                <span className="kick">{clip.kicker}</span>
                <h3>{clip.headline}</h3>
                <p>{clip.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sk-night">
        <div className="sk-sky" />
        <Stadium name={view.stadium} />
        <div className="sk-log">
          {view.night.map((entry, index) => (
            <div key={entry.time} style={ms(2500 + index * 400)}>
              <b>{entry.time}</b>
              {entry.text}
            </div>
          ))}
        </div>
        <div className="sk-phone">
          <div className="sk-screen">
            <div className="sk-wall" style={{ "--strong": strong } as CSSProperties}>
              <div className="sk-wall-crest">
                <Crest club={crestClub(view.club)} size={96} />
              </div>
            </div>
            <div className="sk-lock">
              <small>{view.phoneDate}</small>
              <b ref={clock}>{clockText(from)}</b>
            </div>
            <div className="sk-notes">
              <div className="sk-nt" style={ms(3600)}>
                <div className="h">
                  <Crest club={crestClub(view.club)} size={16} />
                  {view.club.name}
                  <span>agora</span>
                </div>
                <b>Nota oficial</b>
                <p>{view.clubNote}</p>
              </div>
              <div className="sk-nt" style={ms(4050)}>
                <div className="h">
                  <span className="ic">JB</span>Jornal do Boleiro<span>agora</span>
                </div>
                <b>{view.paperAlert}</b>
              </div>
              <div className="sk-nt" style={ms(4450)}>
                <div className="h">
                  <span className="ic sk-aux">{view.assistant.name.charAt(0)}</span>
                  {view.assistant.name}
                  <span>agora</span>
                </div>
                <p>{view.assistant.text}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sk-morning">
        <div className="when">
          <i className="ph-bold ph-newspaper" />
          {view.masthead}
        </div>
        <article className="jb sk-front">
          <div className="mast">
            <h4>
              <span>Jornal do</span>Boleiro
            </h4>
            <small>{view.masthead}</small>
          </div>
          <div className="kick">{view.morning.kicker}</div>
          <h3>{view.morning.headline}</h3>
          <p className="deck">{view.morning.deck}</p>
          <div className="sk-row">
            {view.morning.side.map((item) => (
              <div key={item.headline}>
                <h5>{item.headline}</h5>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
          <div className="sk-tally">
            {view.morning.tally.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
        <div className="sk-reac">
          {view.reactions.map((reaction, index) => (
            <div key={reaction.who} className="sk-fan" style={ms(6000 + index * 300)}>
              <div className="who">
                <Crest club={crestClub(reaction.club)} size={18} />
                {reaction.who}
              </div>
              <b>{reaction.quote}</b>
              <p>{reaction.note}</p>
            </div>
          ))}
        </div>
        <div className="cause sk-cause">
          <b>Por quê</b>
          <span>{view.cause}</span>
        </div>
      </section>
    </MomentStage>
  );
}
