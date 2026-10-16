import { useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Club } from "@boleiro/data/clubs";
import type { Effects, EventArea, PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import type { EventAnswered } from "@boleiro/engine/sim/events/runEvents";
import type { IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { POSITION_NAMES } from "../format/playerLabels.js";
import { effectCells, expiryText, reporterOn, type EffectCell } from "./eventView.js";
import "./eventPopUp.css";

const AREA_ICONS: Record<EventArea, string> = { players: "chat-circle-text", squad: "users-three", board: "briefcase", fans: "megaphone", press: "microphone" };

type Props = {
  event: PendingEvent;
  club: Club;
  rival: Club | null;
  player: SimPlayer | null;
  today: IsoDate;
  /** Where the coach's club stands, under the reporter's question ("Flamengo · 2º lugar · 3 pts"). */
  standing: string | null;
  isBusy: boolean;
  hasFailed: boolean;
  /** The coach's answer once it went through; the window then shows what it did. */
  answered: EventAnswered | null;
  onAnswer: (choice: number | null) => void;
  onClose: () => void;
};

/**
 * The event that waits for the coach, stuck over the hub: who it is about, what they said, and the
 * answers with what each moves. A press conference gets the sponsor wall and the reporter's question.
 */
export function EventPopUp({ event, club, rival, player, today, standing, isBusy, hasFailed, answered, onAnswer, onClose }: Props) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const [chosen, setChosen] = useState<number | null>(null);
  const isPress = event.look === "press";

  function onKeyDown(key: KeyboardEvent) {
    // A focused button answers Enter with its own click.
    if (key.key === "Enter" && key.target instanceof HTMLButtonElement) return;
    if (key.key === "Escape" && !isBusy) onClose();
    const number = Number(key.key);
    if (!answered && number >= 1 && number <= event.choices.length) setChosen(number - 1);
    if (key.key === "Enter" && !answered && chosen !== null && !isBusy) onAnswer(chosen);
  }

  const choices = (
    <div className={isPress ? "ev-answers press" : "ev-answers"} role="radiogroup" aria-label="Respostas">
      <div className="ev-fx-head" aria-hidden="true">
        {effectCells({}, isPress).map((cell) => (
          <span key={cell.key} className="lbl">
            {cell.label}
          </span>
        ))}
      </div>
      {event.choices.map((choice, index) => {
        const isOn = (answered ? answered.choice : chosen) === index;
        return (
          <button
            key={choice.label}
            type="button"
            role="radio"
            aria-checked={isOn}
            className={isOn ? "ev-choice on" : "ev-choice"}
            disabled={answered !== null && !isOn}
            onClick={() => !answered && setChosen(index)}
          >
            <span className="ev-mark" aria-hidden="true">
              {isPress ? index + 1 : null}
            </span>
            <span className="ev-choice-text">
              <b>{choice.label}</b>
              {(choice.detail || choice.effects.outDays) && <small>{[choice.detail, outText(choice.effects, player)].filter(Boolean).join(" · ")}</small>}
            </span>
            <Effects cells={effectCells(choice.effects, isPress)} />
          </button>
        );
      })}
    </div>
  );

  const foot = answered ? (
    <div className="ev-foot ev-done" role="status">
      <p>
        <i className="ph-bold ph-check-circle" aria-hidden="true" />
        {answered.byAssistant ? "O auxiliar respondeu. " : ""}
        <b>{answered.headline}</b>
      </p>
      <button className="btn" onClick={onClose} autoFocus>
        Fechar
      </button>
    </div>
  ) : (
    <div className="ev-foot">
      <p className={hasFailed ? "ev-failed" : undefined} role={hasFailed ? "alert" : undefined}>
        {hasFailed ? "A resposta não saiu. Tente de novo." : isPress && rival ? <>Rivalidade com o <b>{rival.shortName}</b></> : expiryText(event, today)}
      </p>
      <button className="btn flat" onClick={() => onAnswer(null)} disabled={isBusy}>
        <i className="ph-bold ph-user-switch" aria-hidden="true" />
        {isPress ? "O auxiliar responde" : "Deixa com o auxiliar"}
      </button>
      <button className="btn go" onClick={() => chosen !== null && onAnswer(chosen)} disabled={chosen === null || isBusy}>
        <i className={isPress ? "ph-bold ph-microphone" : "ph-bold ph-check"} aria-hidden="true" />
        Responder
      </button>
    </div>
  );

  const close = answered ? null : (
    <button className="ev-x" aria-label="Fechar e responder depois" onClick={onClose} disabled={isBusy}>
      <i className="ph-bold ph-x" aria-hidden="true" />
    </button>
  );

  return createPortal(
    <div className="ev-veil" onKeyDown={onKeyDown}>
      {isPress ? (
        <section className="ev-pop ev-press" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className="ev-wall" aria-hidden="true">
            {Array.from({ length: 30 }, (_, index) =>
              (index + Math.floor(index / 10)) % 2 ? (
                <span key={index} className="ev-wall-tag">
                  BOLEIRO
                </span>
              ) : (
                <span key={index}>
                  <Crest club={club} size={20} />
                </span>
              ),
            )}
          </div>
          <div className="ev-ctx">
            <b>
              <i className="ph-fill ph-microphone" aria-hidden="true" />
              Coletiva
            </b>
            {event.setting}
          </div>
          {close}
          <div className="ev-question">
            <div className="ev-reporter">
              <span className="av" aria-hidden="true">
                {reporterOn(event.date).charAt(0)}
              </span>
              <b>{reporterOn(event.date)}</b>
              <small>Jornal do Boleiro</small>
            </div>
            <div className="ev-bubble">
              <h2 id="event-title" ref={title} tabIndex={-1}>
                {event.body}
              </h2>
              <small>{standing ?? event.headline}</small>
            </div>
          </div>
          {choices}
          {foot}
        </section>
      ) : (
        <section className="ev-pop ev-card" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className="ev-head">
            {player ? <PlayerStamp player={player} club={club} /> : <ClubStamp club={club} />}
            <div>
              <div className="ev-kind">
                <i className={`ph-bold ph-${AREA_ICONS[event.area]}`} aria-hidden="true" />
                {event.setting ? `${event.setting} · ` : ""}
                {formatBarDate(event.date)}
                {close}
              </div>
              <h2 id="event-title" ref={title} tabIndex={-1}>
                {event.headline}
              </h2>
              <blockquote>{event.body}</blockquote>
              {player && (
                <div className="ev-facts">
                  <span>
                    {POSITION_NAMES[player.group]}, <b>{player.age} anos</b>
                  </span>
                  <span>
                    Contrato até <b>{formatMonthYear(player.contractUntil)}</b>
                  </span>
                  <span>
                    <b>{Math.round(player.condition.seasonMinutes)} min</b> na temporada
                  </span>
                </div>
              )}
            </div>
          </div>
          {choices}
          {foot}
        </section>
      )}
    </div>,
    document.body,
  );
}

function outText(effects: Effects, player: SimPlayer | null): string {
  if (!effects.outDays) return "";
  const who = player ? player.name.split(" ")[0] : "Ele";
  return `${who} fica fora ${effects.outDays === 1 ? "1 dia" : `${effects.outDays} dias`}`;
}

function Effects({ cells }: { cells: EffectCell[] }) {
  return (
    <span className="ev-fx">
      {cells.map((cell) => (
        <span key={cell.key} className={cell.tone} aria-label={`${cell.label} ${cell.text}`}>
          {cell.icon && <i className={`ph-bold ph-${cell.icon}`} aria-hidden="true" />}
          {cell.text}
        </span>
      ))}
    </span>
  );
}

/** The player the event is about, as a small sticker in his club's colours. */
function PlayerStamp({ player, club }: { player: SimPlayer; club: Club }) {
  return (
    <div className="ev-stamp" aria-hidden="true">
      <div className="ev-stamp-art" style={{ background: club.colours.primary, color: club.colours.secondary }}>
        <span className="ev-stamp-crest">
          <Crest club={club} size={22} />
        </span>
        <b>{player.name.charAt(0)}</b>
      </div>
      <div className="ev-stamp-name">{player.name}</div>
      <div className="ev-stamp-what">
        {POSITION_NAMES[player.group]} · {player.age} anos
      </div>
    </div>
  );
}

function ClubStamp({ club }: { club: Club }) {
  return (
    <div className="ev-stamp" aria-hidden="true">
      <div className="ev-stamp-art plain">
        <Crest club={club} size={72} />
      </div>
      <div className="ev-stamp-name">{club.shortName}</div>
      <div className="ev-stamp-what">{club.stadium}</div>
    </div>
  );
}
