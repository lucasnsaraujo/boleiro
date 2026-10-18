import { useRef, type CSSProperties, type ReactNode } from "react";
import type { TestimonialView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage, useCanvasTick, useCueAt, useTick } from "../MomentStage.js";
import { crestClub, MomentSticker } from "../MomentSticker.js";
import { clubPaper, confetti } from "../paperMotion.js";
import "./testimonial.css";

type Props = { view: TestimonialView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
// The match runs 0' to 90' between 2.4 s and 5.2 s, 31 ms a minute.
const KICK_OFF = 2400;
const PER_MINUTE = 31;
const at = (minute: number) => KICK_OFF + minute * PER_MINUTE;

/** The board's clock and score, running with the match. */
function Scoreboard({ view }: { view: TestimonialView }) {
  const clock = useRef<HTMLSpanElement>(null);
  const home = useRef<HTMLSpanElement>(null);
  const away = useRef<HTMLSpanElement>(null);
  useTick((t) => {
    const minute = Math.max(0, Math.min(90, Math.floor((t - KICK_OFF) / PER_MINUTE)));
    if (clock.current) clock.current.textContent = t < KICK_OFF ? "Entrada em campo" : minute >= 90 ? "Fim de jogo" : minute === 45 ? "Intervalo" : `${minute}'`;
    const scored = (side: "home" | "away") => view.events.filter((event) => event.side === side && event.minute <= minute && t >= KICK_OFF).length;
    if (home.current) home.current.textContent = String(scored("home"));
    if (away.current) away.current.textContent = String(scored("away"));
  });
  return (
    <div className="ts-sc">
      <span ref={clock} className="clk">
        Entrada em campo
      </span>
      <div className="t">
        <Crest club={crestClub(view.home.club)} size={40} />
        <div>
          {view.home.club.name}
          <small>{view.coachName}</small>
        </div>
      </div>
      <div className="s">
        <span ref={home}>0</span>
        <em>×</em>
        <span ref={away}>0</span>
      </div>
      <div className="t b">
        <div>{view.away.club.name}</div>
        <Crest club={crestClub(view.away.club)} size={40} />
      </div>
    </div>
  );
}

/** An idol's farewell match: the ticket and its torn stub, the two line-ups, the match running to its result, the hero's sticker turning foil and the paper thrown from the stands. */
export function TestimonialScene({ view, actions }: Props) {
  const paper = useCanvasTick((surface) => confetti(surface, { at: 5300, colours: clubPaper(view.club.colours), count: 160, origin: [0.66, 1.04], spread: 0.55, speed: 1500, seed: 11, life: 6000 }));
  useCueAt("fullTime", at(90));
  return (
    <MomentStage durationMs={6600} backdrop="var(--paper)" tone="light" label={`Despedida de ${view.playerName}`} className="mo-testimonial" actions={actions}>
      <div className="ts-ticket">
        <div className="body" style={{ "--c1": view.club.colours.primary, "--c2": view.club.colours.secondary } as CSSProperties}>
          <div className="kick">Ingresso · jogo de despedida</div>
          <h3>
            {view.playerName}
            <span>{view.ticket.matchup}</span>
          </h3>
          <dl>
            <dt>Data</dt>
            <dd>{view.ticket.date}</dd>
            <dt>Estádio</dt>
            <dd>{view.stadium}</dd>
          </dl>
        </div>
        <div className="stub">
          <div>
            <small>JOGOS</small>
            <b>{view.stats[0]?.value}</b>
            <i />
          </div>
        </div>
      </div>
      <section className="ts-hero">
        <div className="ts-flip">
          <MomentSticker sticker={view.hero} crest={22} sheenAt={5800} />
        </div>
        <div>
          <h1>{view.headline}</h1>
          <p>{view.story}</p>
        </div>
      </section>
      <div className="ts-stats">
        {view.stats.map((stat, index) => (
          <div key={stat.label} className={`nst mo-up${stat.isFoil ? " foil" : ""}`} style={ms(1800 + index * 120)}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="cause ts-cause mo-up" style={ms(2200)}>
        <b>Por quê</b>
        <span>{view.cause}</span>
      </div>
      <section className="ts-board">
        <Scoreboard view={view} />
        <div className="ts-xis">
          {[view.home, view.away].map((side, column) => (
            <div key={side.club.id} className="ts-xi">
              <h4>
                {side.club.name} <span>{column === 0 ? "a casa" : "os visitantes"}</span>
              </h4>
              {side.eleven.map((sticker, index) => (
                <MomentSticker key={sticker.id} sticker={sticker} className={sticker.id === view.hero.id ? "hero" : ""} style={ms(1300 + column * 200 + index * 55)} showCaption={false} />
              ))}
            </div>
          ))}
        </div>
        <div className="ts-feed">
          {[...view.events].reverse().map((event, index) => (
            <div key={`${event.minute}-${index}`} className={`ts-ev${event.minute === 88 ? " hl" : ""}`} style={ms(at(event.minute))}>
              <span className="m">{event.minute}'</span>
              <i className={`ph-fill ph-${event.icon}`} />
              <span>
                {event.who && <b>{event.who} </b>}
                {event.text}
              </span>
              <span className="tag">{event.side === "home" ? view.home.club.name : event.side === "away" ? view.away.club.name : ""}</span>
            </div>
          ))}
        </div>
        <div className="ts-foot">
          <span>
            {view.stadium} · renda para <b>{view.playerName}</b>
          </span>
          <span>
            Resultado: <b>{view.score.join(" × ")}</b>
          </span>
        </div>
      </section>
      <canvas ref={paper} className="fill ts-conf" />
    </MomentStage>
  );
}
