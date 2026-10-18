import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoundClub } from "@boleiro/game-client/round/liveRoundOf";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { useFlip } from "../motion/useFlip.js";
import { mainRole, ROLE_LETTER, ROLE_NAME } from "./lineupBoard.js";
import "./incidentWindow.css";
import "./shootoutOrder.css";

// A shootout's first five kick in order; the rest only once it is level after them, in turn.
const FIRST_KICKS = 5;

type Props = {
  club: RoundClub | undefined;
  opponent: RoundClub | undefined;
  /** The match's score from the coach's side: his goals first. */
  score: string;
  /** In a hot-seat round, the coach the round stopped for. */
  coachName?: string;
  /** Who finished on the pitch, in the order they would kick now. */
  kickers: readonly string[];
  squad: readonly SquadPlayer[];
  isBusy: boolean;
  error: string | null;
  onConfirm: (order: string[]) => void;
};

/** A row slides to its new place in the order; with reduced motion it only flashes its tint. */
function slideKicker(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  const moves = !prefersReducedMotion();
  row.animate(
    [
      { ...(moves ? { transform: `translateY(${offset}px)` } : {}), boxShadow: "inset 0 0 0 999px rgba(255, 204, 0, 0.32)" },
      { transform: "none", boxShadow: "inset 0 0 0 999px rgba(255, 204, 0, 0)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}

/**
 * The window that stops a human coach's match when it ends level with a shootout to come, because his
 * match plan asks him the order: who finished on the pitch, in the order they'd kick, moved up and down,
 * with the assistant's order (strongest first) one click away.
 */
export function ShootoutOrder({ club, opponent, score, coachName, kickers, squad, isBusy, error, onConfirm }: Props) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const [order, setOrder] = useState<string[]>(() => [...kickers]);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, order.join(), slideKicker);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const assistantOrder = [...kickers].sort((a, b) => (byId.get(b)?.strength ?? 0) - (byId.get(a)?.strength ?? 0));
  const isAssistants = order.every((id, i) => id === assistantOrder[i]);

  function move(index: number, step: -1 | 1) {
    setOrder((current) => {
      const to = index + step;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to] ?? "", next[index] ?? ""];
      return next;
    });
  }

  const row = (id: string, index: number) => {
    const player = byId.get(id);
    if (!player) return null;
    const role = mainRole(player);
    return (
      <li key={id} data-flip={id} className={index < FIRST_KICKS ? "so-k" : "so-k alt"}>
        <span className="so-no">{index + 1}</span>
        <span className={`pos ${ROLE_LETTER[role]}`} title={ROLE_NAME[role]}>
          {ROLE_LETTER[role]}
        </span>
        <b className="so-nm">{player.name}</b>
        <span className="so-f">{player.strength}</span>
        <span className="so-mv">
          <button className="so-btn" aria-label={`Subir ${player.name}`} disabled={index === 0 || isBusy} onClick={() => move(index, -1)}>
            <i className="ph-bold ph-caret-up" aria-hidden="true" />
          </button>
          <button className="so-btn" aria-label={`Descer ${player.name}`} disabled={index === order.length - 1 || isBusy} onClick={() => move(index, 1)}>
            <i className="ph-bold ph-caret-down" aria-hidden="true" />
          </button>
        </span>
      </li>
    );
  };

  return createPortal(
    <div className="inc-veil so-veil">
      <section className="inc-win so-win" role="dialog" aria-modal="true" aria-labelledby="shootout-title">
        <div className="so-spot" aria-hidden="true">
          <i className="ph-fill ph-soccer-ball" />
        </div>
        <div className="inc-top">
          <div>
            {coachName && (
              <span className="inc-coach">
                {coachName} · {club?.shortName}
              </span>
            )}
            <h2 id="shootout-title" ref={title} tabIndex={-1}>
              Pênaltis
            </h2>
            <p>Vai para os pênaltis. Quem bate, e em que ordem? Só quem terminou em campo.</p>
          </div>
          <div className="inc-score">
            <div className="inc-sc" aria-label={`${club?.shortName ?? ""} contra ${opponent?.shortName ?? ""}, ${score}`}>
              {club && <Crest club={club} size={26} />}
              <span className="so-score">{score}</span>
              {opponent && <Crest club={opponent} size={26} />}
            </div>
          </div>
        </div>

        <ol ref={list} className="so-list" aria-label="Ordem das cobranças">
          {order.slice(0, FIRST_KICKS).map(row)}
          {order.length > FIRST_KICKS && (
            <li className="so-split" aria-hidden="true">
              Alternadas, se empatar nas cinco
            </li>
          )}
          {order.slice(FIRST_KICKS).map((id, i) => row(id, i + FIRST_KICKS))}
        </ol>

        {error && <p className="status error">{error}</p>}
        <div className="inc-acts">
          <button className="btn flat" disabled={isBusy || isAssistants} onClick={() => setOrder(assistantOrder)}>
            <i className="ph-bold ph-user-switch" aria-hidden="true" />
            Ordem do auxiliar
          </button>
          <button className="btn go inc-go" disabled={isBusy} onClick={() => onConfirm(order)}>
            <i className="ph-bold ph-check" aria-hidden="true" />
            Confirmar ordem
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
