import { useState } from "react";
import { createPortal } from "react-dom";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Substitution } from "@boleiro/engine/sim/live/applyLiveChange";
import type { CoachSide, LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { layoffText, type Incident, type Suggestion } from "./incident.js";
import type { MatchAt } from "./roundAt.js";
import "./incidentWindow.css";

const GROUP_NAMES: Record<PositionGroup, string> = { GK: "goleiro", DEF: "defensor", MID: "meio-campista", ATT: "atacante" };
const CARD_WORDS = { red: "Vermelho direto", secondYellow: "Segundo amarelo" } as const;

type Props = {
  incident: Incident;
  round: LiveRound;
  match: MatchAt;
  /** The human coach's side the incident befell, and his club. */
  side: CoachSide;
  clubId: string;
  /** In a hot-seat round, the coach whose match it is. */
  coachName?: string;
  subsLeft: number;
  stopsLeft: number;
  isBusy: boolean;
  error: string | null;
  onLeave: () => void;
  onOpenLineup: () => void;
  onSubstitute: (substitutions: Substitution[]) => void;
};

/**
 * The window that stops the coach's match on a red card or an injury to his side: what happened,
 * the assistant's substitutions (each one a switch, all on), and the way back to the match.
 */
export function IncidentWindow({ incident, round, match, side, clubId, coachName, subsLeft, stopsLeft, isBusy, error, onLeave, onOpenLineup, onSubstitute }: Props) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(incident.suggestions.map((s) => s.forId)));
  const nameOf = (id: string) => round.names[id] ?? "Um jogador";
  const playerOf = (id: string) => side.squad.find((p) => p.id === id);
  const suggestionFor = (id: string) => incident.suggestions.find((s) => s.forId === id);
  const club = round.clubs[clubId];
  const home = round.clubs[match.homeId];
  const away = round.clubs[match.awayId];

  const red = incident.sentOff[0];
  const headlineId = red?.playerId ?? incident.hurt[0]?.playerId ?? "";
  const days = incident.hurt.find((h) => h.playerId === headlineId)?.days ?? 0;
  const headline = suggestionFor(headlineId);
  const others = [
    ...incident.sentOff.filter((s) => s.playerId !== headlineId).map((s) => ({ id: s.playerId, line: `Expulso: ${nameOf(s.playerId)}`, note: `${CARD_WORDS[s.card]}.`, isRed: true })),
    ...incident.hurt.filter((h) => h.playerId !== headlineId).map((h) => ({ id: h.playerId, line: `${nameOf(h.playerId)} se machucou`, note: `Fora de ${layoffText(h.days)}.`, isRed: false })),
  ];
  const picked = incident.suggestions.filter((s) => chosen.has(s.forId));

  function toggle(forId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(forId)) next.add(forId);
      return next;
    });
  }

  const swapSwitch = (suggestion: Suggestion, label: string) => (
    <label className="inc-swap">
      {label}
      <input type="checkbox" className="inc-sw" checked={chosen.has(suggestion.forId)} onChange={() => toggle(suggestion.forId)} />
    </label>
  );

  const why = (suggestion: Suggestion) => {
    if (suggestion.forId === suggestion.offId) return "Entra o melhor da posição que está no banco.";
    return playerOf(suggestion.forId)?.group === "GK" ? "Põe um goleiro no gol e tira o atacante que rende menos." : "Repõe a defesa e tira o atacante que rende menos.";
  };
  const stayNote = red ? `Segue com ${incident.playersLeft}, sem troca.` : "Sem trocas sobrando: ele fica em campo.";

  return createPortal(
    <div className="inc-veil">
      <section className="inc-win" role="dialog" aria-modal="true" aria-labelledby="incident-title">
        <div className={red ? "inc-sticker red" : "inc-sticker hurt"} aria-hidden="true">
          {!red && <i className="ph-fill ph-first-aid" />}
          {incident.minute}'
        </div>
        <div className="inc-top">
          <div>
            {coachName && (
              <span className="inc-coach">
                {coachName} · {club?.shortName}
              </span>
            )}
            <h2 id="incident-title" ref={title} tabIndex={-1}>
              {red ? "Expulso: " : "Machucou: "}
              <em>{nameOf(headlineId)}</em>
            </h2>
            <p>{red ? `${CARD_WORDS[red.card]}. ${club?.shortName ?? "Seu time"} fica com ${incident.playersLeft}.` : `Fora de ${layoffText(days)}.`}</p>
          </div>
          <div className="inc-score">
            <div className="inc-sc" aria-label={`${home?.shortName ?? ""} ${match.score.home} x ${match.score.away} ${away?.shortName ?? ""}`}>
              {home && <Crest club={home} size={26} />}
              <span className="sbox">{match.score.home}</span>
              <span className="sbox">{match.score.away}</span>
              {away && <Crest club={away} size={26} />}
            </div>
            <span className="inc-left">
              <i className="ph-bold ph-arrows-left-right" aria-hidden="true" />
              {subsLeft === 1 ? "1 troca" : `${subsLeft} trocas`} · {stopsLeft === 1 ? "1 parada" : `${stopsLeft} paradas`}
            </span>
          </div>
        </div>

        <div className="inc-fix">
          <span className="inc-who">
            <i className="ph-bold ph-user-switch" aria-hidden="true" />
            Auxiliar sugere
          </span>
          {headline ? (
            <>
              <div className="inc-chg">
                <b>
                  Sai {nameOf(headline.offId)}, entra {nameOf(headline.onId)}.
                </b>
                <div className="inc-arrows">
                  <span className="o">
                    <i className="ph-bold ph-arrow-down" aria-hidden="true" />
                    {nameOf(headline.offId)}, {GROUP_NAMES[playerOf(headline.offId)?.group ?? "MID"]}
                  </span>
                  <span className="n">
                    <i className="ph-bold ph-arrow-up" aria-hidden="true" />
                    {nameOf(headline.onId)}, {GROUP_NAMES[playerOf(headline.onId)?.group ?? "MID"]}, força {playerOf(headline.onId)?.strength ?? "?"}
                  </span>
                </div>
                <p>{why(headline)}</p>
              </div>
              {swapSwitch(headline, "Fazer essa troca")}
            </>
          ) : (
            <div className="inc-chg">
              <b>{stayNote}</b>
            </div>
          )}
        </div>

        {others.map((other) => {
          const suggestion = suggestionFor(other.id);
          return (
            <div key={other.id} className="inc-row">
              <span className={other.isRed ? "inc-ic red" : "inc-ic"} aria-hidden="true">
                {other.isRed ? <span className="rc" /> : <i className="ph-fill ph-first-aid" />}
              </span>
              <div>
                <b>{other.line}</b>
                <p>{other.note}</p>
              </div>
              {suggestion ? swapSwitch(suggestion, `Sai ${nameOf(suggestion.offId)}, entra ${nameOf(suggestion.onId)}`) : <span className="inc-none">Sem troca</span>}
            </div>
          );
        })}

        {error && <p className="status error">{error}</p>}
        <div className="inc-acts">
          <button className="btn flat" onClick={onLeave} disabled={isBusy}>
            Deixar como está
          </button>
          <button className="btn" onClick={onOpenLineup} disabled={isBusy}>
            <i className="ph-bold ph-strategy" aria-hidden="true" />
            Abrir escalação
          </button>
          {incident.suggestions.length > 0 && (
            <button className="btn go inc-go" onClick={() => onSubstitute(picked.map(({ offId, onId }) => ({ offId, onId })))} disabled={isBusy || picked.length === 0}>
              <i className="ph-bold ph-arrows-left-right" aria-hidden="true" />
              {picked.length === 1 ? "Fazer a troca" : `Fazer as ${picked.length} trocas`}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
