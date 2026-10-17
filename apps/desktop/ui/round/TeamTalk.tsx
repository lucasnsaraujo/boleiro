import type { KeyboardEvent } from "react";
import { clubArticle, withArticle } from "@boleiro/data/articles";
import { TALK_TONES, type TalkEffect, type TalkMoment, type TalkTone } from "@boleiro/engine/sim/live/teamTalk";
import "./teamTalk.css";

const TONES: Record<TalkTone, { name: string; icon: string }> = {
  calm: { name: "Calma", icon: "hourglass-medium" },
  faith: { name: "Confiança", icon: "handshake" },
  demand: { name: "Cobrança", icon: "megaphone" },
  praise: { name: "Elogio", icon: "star" },
};

/** What the coach says in each tone, for where his side stands: behind, level or ahead; before kick-off it is level. */
function quoteOf(tone: TalkTone, { lead, isDerby }: TalkMoment, isKickOff: boolean): string {
  const at = lead < 0 ? "behind" : lead > 0 ? "ahead" : "level";
  if (isKickOff) {
    if (tone === "calm") return isDerby ? "“Clássico se ganha com a cabeça fria.”" : "“Cabeça no lugar. Um jogo de cada vez.”";
    if (tone === "faith") return "“Confio em cada um de vocês.”";
    if (tone === "demand") return "“Hoje eu quero ver raça do primeiro ao último minuto.”";
    return "“Vocês estão voando. Mostrem isso lá dentro.”";
  }
  const lines: Record<TalkTone, Record<typeof at, string>> = {
    calm: { behind: "“Sem desespero. Um gol muda tudo.”", level: isDerby ? "“Clássico se ganha com a cabeça fria.”" : "“Cabeça no lugar. O jogo é longo.”", ahead: "“Calma. É só não inventar.”" },
    faith: { behind: "“Eu acredito em vocês. Dá para virar.”", level: "“Tá aberto. Vamos buscar.”", ahead: "“Confio em vocês. Segue assim.”" },
    demand: { behind: "“Isso aqui não é o nosso time. Acordem!”", level: "“Quero mais. Dá para ganhar.”", ahead: "“Não está bom. Quero mais!”" },
    praise: { behind: "“Está bom, gente. Só falta caprichar.”", level: "“Bom jogo. Falta o gol.”", ahead: "“Que primeiro tempo! Mantém.”" },
  };
  return lines[tone][at];
}

/** How the dressing room took the talk, from the form shift it gave. */
function reactionOf(form: number): string {
  if (form >= 0.1) return "O grupo voltou ligado.";
  if (form > 0) return "Recado dado.";
  if (form === 0) return "Entrou por um ouvido e saiu pelo outro.";
  return "Caiu mal no vestiário.";
}

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

type HalfTimeProps = {
  /** The coach's club, and the match's two sides as the board shows them with the score at the break. */
  club: string;
  /** The coach's club's id, for the article its name takes ("vestiário da Chapecoense"). */
  clubId?: string;
  home: string;
  away: string;
  /** The coach's name above the card in a hot-seat round, where each human coach talks to his own side. */
  coachName?: string;
  score: string;
  moment: TalkMoment;
  suggested: TalkTone;
  given: (TalkEffect & { tone: TalkTone }) | null;
  isBusy: boolean;
  onTalk: (tone: TalkTone) => void;
};

/**
 * The dressing room at half-time: four tones to talk to the side in, the assistant's pick marked, one click
 * each; never in the way, since the round goes on without a talk. Once given, how the group took it.
 */
export function HalfTimeTalk({ club, clubId, home, away, coachName, score, moment, suggested, given, isBusy, onTalk }: HalfTimeProps) {
  const label = `Intervalo: vestiário ${withArticle(club, clubArticle(clubId ?? ""), "de")}`;
  if (given) {
    const tone = TONES[given.tone];
    return (
      <section className="talk said" aria-label={label}>
        <span className="talk-tape" aria-hidden="true" />
        <div className="talk-said" role="status">
          <span className={`talk-stamp tone-${given.tone}`}>
            <i className={`ph-fill ph-${tone.icon}`} aria-hidden="true" />
            {tone.name}
          </span>
          <p>
            <b>{reactionOf(given.form)}</b>
            {quoteOf(given.tone, moment, false)}
          </p>
          <span className="talk-moves">
            <span className={given.form > 0 ? "up" : given.form < 0 ? "dn" : "eq"}>Forma {given.form > 0 ? "↑" : given.form < 0 ? "↓" : "="}</span>
            <span className={given.morale > 0 ? "up" : given.morale < 0 ? "dn" : "eq"}>Moral {signed(given.morale)}</span>
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="talk" aria-label={label}>
      <span className="talk-tape" aria-hidden="true" />
      <header className="talk-head">
        <span className="lbl">
          <i className="ph-fill ph-chalkboard-teacher" aria-hidden="true" />
          Intervalo · vestiário{coachName ? ` · ${coachName}` : ""}
        </span>
        <h2>
          {home} <b>{score}</b> {away}
        </h2>
        <p>O que você diz ao grupo?</p>
      </header>
      <div className="talk-tones">
        {TALK_TONES.map((tone) => {
          const quote = quoteOf(tone, moment, false);
          return (
            <button key={tone} type="button" className={`talk-tone tone-${tone}`} aria-label={`${TONES[tone].name}: ${quote}`} disabled={isBusy} onClick={() => onTalk(tone)}>
              <span className="talk-ic" aria-hidden="true">
                <i className={`ph-fill ph-${TONES[tone].icon}`} />
              </span>
              <b>{TONES[tone].name}</b>
              <q>{quote.replace(/^“|”$/g, "")}</q>
              {tone === suggested && <span className="talk-tag">Auxiliar sugere</span>}
            </button>
          );
        })}
      </div>
      <footer className="talk-foot">
        <p>Sem conversa, o time volta como saiu.</p>
        <button type="button" className="btn flat sm" disabled={isBusy} onClick={() => onTalk(suggested)}>
          <i className="ph-bold ph-user-switch" aria-hidden="true" />
          Deixa com o auxiliar
        </button>
      </footer>
    </section>
  );
}

type KickOffProps = { moment: TalkMoment; suggested: TalkTone; picked: TalkTone | null; onPick: (tone: TalkTone | null) => void };

/** The talk before kick-off, in the lineup sheet: optional, one tone or none; the assistant's pick marked. */
export function KickOffTalk({ moment, suggested, picked, onPick }: KickOffProps) {
  // A radio group: one tab stop (the picked tone, else the first), the arrows moving the pick round the tones, focus going with it.
  const focusable = picked ?? TALK_TONES[0];
  function movePick(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = TALK_TONES.indexOf(focusable);
    const next = TALK_TONES[(at + step + TALK_TONES.length) % TALK_TONES.length] ?? focusable;
    onPick(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tone="${next}"]`)?.focus();
  }
  return (
    <div className="talk-kick" role="radiogroup" aria-label="Preleção" onKeyDown={movePick}>
      <span className="talk-kick-lbl">
        <i className="ph-bold ph-chalkboard-teacher" aria-hidden="true" />
        Preleção
      </span>
      {TALK_TONES.map((tone) => {
        const isOn = picked === tone;
        return (
          <button
            key={tone}
            type="button"
            role="radio"
            aria-checked={isOn}
            tabIndex={tone === focusable ? 0 : -1}
            data-tone={tone}
            aria-label={`${TONES[tone].name}: ${quoteOf(tone, moment, true)}`}
            title={quoteOf(tone, moment, true)}
            className={`talk-pill tone-${tone}${isOn ? " on" : ""}`}
            onClick={() => onPick(isOn ? null : tone)}
          >
            <i className={`ph-fill ph-${TONES[tone].icon}`} aria-hidden="true" />
            {TONES[tone].name}
            {tone === suggested && <span className="talk-dot" title="Auxiliar sugere" />}
          </button>
        );
      })}
    </div>
  );
}
