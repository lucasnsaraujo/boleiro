import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Club } from "@boleiro/data/clubs";
import type { Goal, TitlePage as Title } from "@boleiro/game-client/album/albumOf";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { PaperConfetti } from "./PaperConfetti.js";

type Clubs = Readonly<Record<string, Club>>;

const ordinal = (n: number) => `${n}º`;
const GOAL_KINDS: Partial<Record<NonNullable<Goal["kind"]>, string>> = { penalty: "pênalti", ownGoal: "contra", freeKick: "falta", olympic: "olímpico", header: "de cabeça" };

/** The lines of a title's story, from what the career had recorded when he won it. */
export function storyLines(title: Title): string[] {
  const { story, season } = title;
  const lines = [story.careerTitle === 1 ? "Seu primeiro título na carreira." : `Seu ${ordinal(story.careerTitle)} título na carreira.`];
  lines.push(story.seasonAtClub === 1 ? "Na sua primeira temporada no clube." : `Na sua ${story.seasonAtClub}ª temporada no clube.`);
  if (story.clubLastWon !== null) lines.push(season - story.clubLastWon === 1 ? `Bicampeão: o clube também ganhou em ${story.clubLastWon}.` : `O último título do clube nesta competição tinha sido em ${story.clubLastWon}.`);
  else if (season > story.historyFrom) lines.push(`Primeira vez do clube desde ${story.historyFrom}, quando o jogo começou.`);
  if (story.lostFinals.length) lines.push(`Depois de perder a final de ${story.lostFinals.join(" e de ")}.`);
  if (story.derby) lines.push(`Decidido no clássico: ${story.derby}.`);
  return lines;
}

/** "Final, jogo de volta", "Jogo do título" */
function deciderLabel(title: Title): string {
  const decider = title.decider;
  if (!decider) return "Final";
  if (decider.kind === "league") return "Jogo do título";
  return decider.firstLeg ? "Final, jogo de volta" : "Final";
}

type Props = { title: Title; clubs: Clubs; onClose: () => void; onOpenMatch: (ref: string) => void };

/**
 * A title's special page, opened from the album: the trophy in the club's colours, the deciding match
 * with its scorers as they happened, the story the career had recorded, and the way to its ficha.
 * Paper flies when it opens.
 */
export function TitlePage({ title, clubs, onClose, onOpenMatch }: Props) {
  const heading = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const club = clubs[title.clubId];
  const colours = club ? plateColours(club.colours) : { background: "#0B7A3B", text: "#FFFFFF" };
  const { decider } = title;
  const nameOf = (id: string) => clubs[id]?.shortName ?? id;
  const style = { "--c": colours.background, "--ic": colours.text } as CSSProperties;
  const lines = storyLines(title);
  const side = (id: string) => (
    <span className="ab-tp-side">
      {clubs[id] && <Crest club={clubs[id]} size={44} />}
      <span>{nameOf(id)}</span>
    </span>
  );
  return createPortal(
    <div
      className="ab-veil"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="page ab-tp"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ab-tp-title"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onClose();
        }}
      >
        <PaperConfetti colours={[club?.colours.primary ?? "#0B7A3B", club?.colours.secondary ?? "#FFFFFF", "#FFCC00"]} />
        <header className="ab-tp-band">
          <span className="ab-tp-trophy" aria-hidden="true">
            <i className="ph-fill ph-trophy" />
          </span>
          <div className="ab-tp-head">
            <p className="ab-tp-kicker">
              Campeão · {title.season}
              {club && ` · ${club.shortName}`}
            </p>
            <h2 id="ab-tp-title" ref={heading} tabIndex={-1}>
              {title.name}
            </h2>
          </div>
          <span className="ab-tp-stamp" aria-hidden="true">
            Campeão
          </span>
          <button className="ab-tp-x" aria-label="Fechar a página do título" onClick={onClose}>
            <i className="ph-bold ph-x" aria-hidden="true" />
          </button>
        </header>
        {decider ? (
          <div className="ab-tp-match">
            <p className="lbl">
              {deciderLabel(title)} · {formatGameDate(decider.date)}
            </p>
            <div className="ab-tp-score" aria-label={`${nameOf(decider.homeId)} ${decider.homeGoals} x ${decider.awayGoals} ${nameOf(decider.awayId)}`}>
              {side(decider.homeId)}
              <span className="ab-tp-digits" aria-hidden="true">
                <b>{decider.homeGoals}</b>
                <i>×</i>
                <b>{decider.awayGoals}</b>
              </span>
              {side(decider.awayId)}
            </div>
            <p className="ab-tp-sub">
              {[
                decider.firstLeg && `Ida: ${nameOf(decider.firstLeg.homeId)} ${decider.firstLeg.homeGoals} × ${decider.firstLeg.awayGoals} ${nameOf(decider.firstLeg.awayId)}`,
                decider.isAfterExtraTime && "na prorrogação",
                decider.penaltyWinnerId && `${nameOf(decider.penaltyWinnerId)} nos pênaltis`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {decider.goals.length > 0 && (
              <ol className="ab-tp-goals" aria-label="Gols">
                {decider.goals.map((goal, i) => (
                  <li key={`${goal.minute}-${i}`} className={goal.clubId === decider.homeId ? "is-home" : "is-away"} style={{ "--i": i } as CSSProperties}>
                    <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
                    <b>{goal.minute}'</b> {goal.name}
                    {goal.kind && GOAL_KINDS[goal.kind] && <small> ({GOAL_KINDS[goal.kind]})</small>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <p className="note ab-tp-missing">A final não ficou guardada: o título é de uma temporada jogada antes do álbum.</p>
        )}
        <ul className="ab-tp-story" aria-label="A história do título">
          {lines.map((line, i) => (
            <li key={line} className="note" style={{ "--i": i } as CSSProperties}>
              {line}
            </li>
          ))}
        </ul>
        {decider && (
          <footer className="ab-tp-foot">
            <span>{[decider.stadium, decider.crowd !== null && `${decider.crowd.toLocaleString("pt-BR")} torcedores`].filter(Boolean).join(" · ")}</span>
            <button className="btn go" onClick={() => onOpenMatch(decider.ref)}>
              <i className="ph-bold ph-article" aria-hidden="true" />
              {decider.kind === "league" ? "Ver ficha do jogo do título" : "Ver ficha da final"}
            </button>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
