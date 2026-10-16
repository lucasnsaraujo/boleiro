import { useEffect, type ReactNode } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { Lane } from "@boleiro/data/players";
import type { Marking } from "@boleiro/engine/engine/match";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { followAssistant, tacticsBoard, type BoardPlayer, type BoardSide, type Dial, type LaneView, type MatchMoment, type TacticsBoard } from "@boleiro/engine/sim/coach/tacticsBoard";
import type { MatchResult } from "@boleiro/game-client/round/matchDayPlan";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { MARKING_LABEL, MARKINGS, PLAY_LABEL, PLAYS, POSTURE_LABEL, POSTURES } from "./tacticsLabels.js";
import "./tacticsPanel.css";

type ClubFace = Pick<Club, "id" | "shortName" | "colours">;

/** What the tactics panel needs besides the coach's eleven and tactics: both clubs, the opponent's side and recent results, and where the match stands. */
export type TacticsContext = { club: ClubFace; opponentClub: ClubFace; opponent: BoardSide; opponentForm: readonly MatchResult[]; moment: MatchMoment };

type Props = {
  context: TacticsContext;
  eleven: readonly BoardPlayer[];
  tactics: Tactics;
  isLive: boolean;
  onChange: (tactics: Tactics) => void;
  onClose: () => void;
};

const LANE_LABEL: Record<Lane, string> = { left: "Esquerda", centre: "Centro", right: "Direita" };
const LANE_PLACE: Record<Lane, string> = { left: "na esquerda", centre: "pelo centro", right: "na direita" };
// Marking as two three-step scales, as the approved mock shows it: tackles won and cards taken.
const MARKING_STEP: Record<Marking, number> = { light: 1, heavy: 2, veryHeavy: 3 };
const DIAL_COUNT = 4;
const RESULT_LETTER: Record<MatchResult, string> = { win: "V", draw: "E", loss: "D" };
const RESULT_NAME: Record<MatchResult, string> = { win: "vitória", draw: "empate", loss: "derrota" };

const round = (value: number) => Math.round(value);
const decimal = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A share against the usual as a signed percentage: +12%, −15%, or 0%. */
function percent(ratio: number): string {
  const points = Math.round((ratio - 1) * 100);
  return points === 0 ? "0%" : `${points > 0 ? "+" : "−"}${Math.abs(points)}%`;
}

/** "A", "A e B", "A, B e C". */
function names(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

const rgbOf = (colour: string) => [0, 2, 4].map((at) => parseInt(colour.replace("#", "").slice(at, at + 2), 16) || 0);
// Brighter than this, a colour disappears on the card; closer than this, two bars read as one.
const PALE = 220;
const ALIKE = 90;

/** A club's colour for its bar: its first colour, or its second when the first is too pale to see on the card. */
function barColour({ primary, secondary }: ClubFace["colours"]): string {
  const [r = 0, g = 0, b = 0] = rgbOf(primary);
  return 0.299 * r + 0.587 * g + 0.114 * b > PALE ? secondary : primary;
}

/** Both clubs' bar colours; the opponent takes its other colour when the two would look the same. */
function barColours(club: ClubFace, opponent: ClubFace): [string, string] {
  const own = barColour(club.colours);
  const theirs = barColour(opponent.colours);
  const distance = Math.hypot(...rgbOf(own).map((value, i) => value - (rgbOf(theirs)[i] ?? 0)));
  const other = theirs === opponent.colours.primary ? opponent.colours.secondary : opponent.colours.primary;
  return [own, distance < ALIKE ? other : theirs];
}

function momentLabel({ minute, lead }: MatchMoment): string {
  const score = lead > 0 ? `vencendo por ${lead}` : lead < 0 ? `perdendo por ${-lead}` : "empatado";
  return `${minute}' · ${score}`;
}

/** The middle, or the flanks' mean, of the lanes: the coach's attack there and the defence it meets. */
function wayOf(lanes: readonly LaneView[], way: "middle" | "flanks"): { attack: number; defense: number } {
  const chosen = lanes.filter((l) => (way === "middle" ? l.lane === "centre" : l.lane !== "centre"));
  const mean = (pick: (l: LaneView) => number) => (chosen.length ? chosen.reduce((sum, l) => sum + pick(l), 0) / chosen.length : 0);
  return { attack: mean((l) => l.attack), defense: mean((l) => l.defense) };
}

function Seg<T extends string>({ label, options, value, suggested, labelOf, onPick }: { label: string; options: readonly T[]; value: T | undefined; suggested: T; labelOf: (option: T) => string; onPick: (option: T) => void }) {
  return (
    <div className="tac-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} aria-pressed={value === option} className={option === suggested && option !== value ? "sg" : undefined} onClick={() => onPick(option)}>
          {labelOf(option)}
        </button>
      ))}
    </div>
  );
}

/** The assistant's word on one dial: a quiet note when the coach already agrees, a yellow card with "Seguir" when not. */
function Advice({ dial, isSame, value, reason, onFollow }: { dial: string; isSame: boolean; value: string; reason: string; onFollow: () => void }) {
  if (isSame) {
    return (
      <div className="tac-sug same" key="same">
        <span className="who">
          <i className="ph-bold ph-check-circle" aria-hidden="true" />
          Igual ao auxiliar
        </span>
        <p>{reason}</p>
      </div>
    );
  }
  return (
    <div className="tac-sug" key="differs">
      <span className="who">
        <i className="ph-bold ph-user-switch" aria-hidden="true" />
        Auxiliar sugere
      </span>
      <b>{value}</b>
      <button className="btn sm" aria-label={`Seguir o auxiliar na ${dial}`} onClick={onFollow}>
        Seguir
      </button>
      <p>{reason}</p>
    </div>
  );
}

function Dial({ name, hint, control, effect, advice }: { name: string; hint: string; control: ReactNode; effect: ReactNode; advice: ReactNode }) {
  return (
    <div className="tac-dial">
      <div className="nm">
        <b>{name}</b>
        <span>{hint}</span>
      </div>
      <div className="ctl">
        {control}
        <div className="eff">{effect}</div>
      </div>
      {advice}
    </div>
  );
}

function Scale({ label, step, isCards }: { label: string; step: number; isCards?: boolean }) {
  return (
    <span className="tac-mk">
      {label}
      <span className={isCards ? "scale c" : "scale"} aria-label={`${label}: ${step} de 3`}>
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? "on" : undefined} />
        ))}
      </span>
    </span>
  );
}

function Lanes({ board, context }: { board: TacticsBoard; context: TacticsContext }) {
  return (
    <div className="tac-lanes">
      {board.lanes.map((lane) => {
        const edge = round(lane.attack) - round(lane.defense);
        return (
          <div key={lane.lane} className={edge > 0 ? "tac-lane win" : "tac-lane"} data-lane={lane.lane}>
            <span className="tt">{LANE_LABEL[lane.lane]}</span>
            <i className="ph-bold ph-arrow-up arr" aria-hidden="true" />
            <div className="duel">
              <div className="sc">
                {round(lane.attack)}
                <em>×</em>
                {round(lane.defense)}
              </div>
              <small>
                {lane.attacker?.name ?? context.club.shortName}
                <br />× {lane.defender?.name ?? context.opponentClub.shortName}
              </small>
            </div>
            <span className="res">
              {edge > 0 && <i className="ph-fill ph-check-circle" aria-hidden="true" />}
              {edge > 0 ? `+${edge}` : edge < 0 ? `−${-edge}` : "0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Sectors({ board, context }: { board: TacticsBoard; context: TacticsContext }) {
  const [own, theirs] = barColours(context.club, context.opponentClub);
  const rows = [
    ["Defesa", board.sectors.own.DEF, board.sectors.opponent.DEF],
    ["Meio", board.sectors.own.MID, board.sectors.opponent.MID],
    ["Ataque", board.sectors.own.ATT, board.sectors.opponent.ATT],
  ] as const;
  return (
    <div className="tac-sec">
      <div className="sr hd">
        <span>Setor</span>
        <Crest club={context.club} size={18} />
        <span />
        <Crest club={context.opponentClub} size={18} />
      </div>
      {rows.map(([label, mine, other]) => (
        <div className="sr" key={label}>
          <span className="k">{label}</span>
          <b>{round(mine)}</b>
          <span className="sb">
            <i style={{ flex: round(mine), background: own }} />
            <i style={{ flex: round(other), background: theirs }} />
          </span>
          <b>{round(other)}</b>
        </div>
      ))}
    </div>
  );
}

/**
 * The tactics panel, the approved tactics mock: the four dials with what each does and the assistant's
 * word on it, and on the right where the coach's side wins, sector by sector and lane by lane, and how
 * the opponent's coach set up. Every change goes straight to the lineup sheet behind it.
 */
export function TacticsPanel({ context, eleven, tactics, isLive, onChange, onClose }: Props) {
  const title = useDialogFocus<HTMLHeadingElement>(true);
  const board = tacticsBoard({ name: context.club.shortName, eleven, tactics }, context.opponent, context.moment);
  const { assistant } = board;
  const follow = (dial?: Dial) => onChange(followAssistant(tactics, board, dial));
  const set = (change: Partial<Tactics>) => onChange({ ...tactics, ...change });
  const marking = tactics.marking ?? "heavy";
  const opponentTactics = context.opponent.tactics;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const postureReason =
    tactics.posture === assistant.posture.value
      ? `A que rende mais pontos daqui: ${decimal(assistant.posture.points)} esperados.`
      : `${decimal(assistant.posture.points)} pontos esperados, contra ${decimal(assistant.posture.currentPoints)} na ${POSTURE_LABEL[tactics.posture].toLowerCase()}.`;
  const markingReason =
    assistant.marking.reason.kind === "booked"
      ? `${names(assistant.marking.reason.names)} ${assistant.marking.reason.names.length > 1 ? "estão pendurados" : "está pendurado"}.`
      : assistant.marking.reason.kind === "outgunned"
        ? `Ataque deles ${round(assistant.marking.reason.attack)} contra sua defesa ${round(assistant.marking.reason.defense)}.`
        : "Ninguém pendurado e sem sufoco: a marcação de sempre.";
  const duel = assistant.play.duel;
  const playReason = duel?.attacker && duel.defender ? `${duel.attacker.name} ${round(duel.attacker.strength)} contra ${duel.defender.name} ${round(duel.defender.strength)} ${LANE_PLACE[duel.lane]}.` : "O setor que ganha o duelo.";
  const formationSectors = assistant.formation.sectors;
  const formationReason =
    tactics.formation === assistant.formation.value
      ? "A formação que mais encaixa os seus onze contra eles."
      : `Defesa ${round(formationSectors.DEF)}, meio ${round(formationSectors.MID)} e ataque ${round(formationSectors.ATT)} com os seus onze.`;
  const way = tactics.play ? wayOf(board.lanes, tactics.play) : null;
  const wayEdge = way ? round(way.attack) - round(way.defense) : 0;

  return (
    <section className="tac" role="dialog" aria-modal="true" aria-labelledby="tactics-title">
      <div className="page tac-dials">
        <header className="tac-hd">
          <h2 id="tactics-title" ref={title} tabIndex={-1}>
            Tática
          </h2>
          <p>
            {context.club.shortName} × {context.opponentClub.shortName}
            {isLive && <> · {momentLabel(context.moment)}</>} ·{" "}
            {board.changes === 0 ? (
              <b>tudo como o auxiliar</b>
            ) : (
              <>
                o auxiliar mudaria{" "}
                <b>
                  {board.changes} de {DIAL_COUNT}
                </b>
              </>
            )}
          </p>
        </header>

        <Dial
          name="Formação"
          hint="Muda a força de cada setor"
          control={<Seg label="Formação" options={board.formations} value={tactics.formation} suggested={assistant.formation.value} labelOf={(f) => f} onPick={(formation) => set({ formation })} />}
          effect={
            <>
              <span className="k">Com {tactics.formation}</span>
              <span>
                Defesa <b>{round(board.sectors.own.DEF)}</b>
              </span>
              <span>
                Meio <b>{round(board.sectors.own.MID)}</b>
              </span>
              <span>
                Ataque <b>{round(board.sectors.own.ATT)}</b>
              </span>
            </>
          }
          advice={<Advice dial="formação" isSame={tactics.formation === assistant.formation.value} value={assistant.formation.value} reason={formationReason} onFollow={() => follow("formation")} />}
        />

        <Dial
          name="Postura"
          hint="Quanto o time sobe"
          control={<Seg label="Postura" options={POSTURES} value={tactics.posture} suggested={assistant.posture.value} labelOf={(p) => POSTURE_LABEL[p]} onPick={(posture) => set({ posture })} />}
          effect={
            tactics.posture === "balanced" ? (
              <span className="k">Equilibrada · as chances de sempre</span>
            ) : (
              <>
                <span className="k">{POSTURE_LABEL[tactics.posture]}</span>
                <span>
                  Chances suas <b className={board.postureChances.own >= 1 ? "up" : "dn"}>{percent(board.postureChances.own)}</b>
                </span>
                <span>
                  Chances deles <b className={board.postureChances.theirs > 1 ? "dn" : "up"}>{percent(board.postureChances.theirs)}</b>
                </span>
              </>
            )
          }
          advice={<Advice dial="postura" isSame={tactics.posture === assistant.posture.value} value={POSTURE_LABEL[assistant.posture.value]} reason={postureReason} onFollow={() => follow("posture")} />}
        />

        <Dial
          name="Marcação"
          hint="Mais desarme, mais cartão"
          control={<Seg label="Marcação" options={MARKINGS} value={marking} suggested={assistant.marking.value} labelOf={(m) => MARKING_LABEL[m]} onPick={(value) => set({ marking: value })} />}
          effect={
            <>
              <Scale label="Desarmes" step={MARKING_STEP[marking]} />
              <Scale label="Cartões" step={MARKING_STEP[marking]} isCards />
            </>
          }
          advice={<Advice dial="marcação" isSame={marking === assistant.marking.value} value={MARKING_LABEL[assistant.marking.value]} reason={markingReason} onFollow={() => follow("marking")} />}
        />

        <Dial
          name="Jogada"
          hint="Rende onde seu setor ganha"
          control={<Seg label="Jogada" options={PLAYS} value={tactics.play} suggested={assistant.play.value} labelOf={(p) => PLAY_LABEL[p]} onPick={(play) => set({ play })} />}
          effect={
            way && tactics.play ? (
              <>
                <span className="k">{PLAY_LABEL[tactics.play]}</span>
                <span>
                  {tactics.play === "middle" ? "Seu meio" : "Suas pontas"} <b>{round(way.attack)}</b> × <b>{round(way.defense)}</b> deles
                </span>
                <span className={wayEdge > 0 ? "up strong" : wayEdge < 0 ? "dn strong" : "k"}>
                  {wayEdge !== 0 && <i className={wayEdge > 0 ? "ph-bold ph-trend-up" : "ph-bold ph-trend-down"} aria-hidden="true" />}
                  {wayEdge > 0 ? "ganha" : wayEdge < 0 ? "perde" : "empata"}
                </span>
              </>
            ) : (
              <span className="k">Sem jogada definida: o time mistura o meio e as pontas</span>
            )
          }
          advice={<Advice dial="jogada" isSame={tactics.play === assistant.play.value} value={PLAY_LABEL[assistant.play.value]} reason={playReason} onFollow={() => follow("play")} />}
        />

        <footer className="tac-acts">
          <button className="btn" onClick={onClose}>
            <i className="ph-bold ph-arrow-left" aria-hidden="true" />
            Escalação
          </button>
          <span className="n">{isLive ? "Vale a partir do próximo minuto." : "Dá pra mudar também durante o jogo."}</span>
          <button className="btn y" disabled={board.changes === 0} onClick={() => follow()}>
            <i className="ph-bold ph-user-switch" aria-hidden="true" />
            Seguir o auxiliar em tudo
          </button>
        </footer>
      </div>

      <aside className="tac-side">
        <div className="stk tac-cmp">
          <h3>Onde você ganha</h3>
          <div className="vs">
            <Crest club={context.club} size={20} />
            <b>{context.club.shortName}</b> ataca contra a defesa do <b>{context.opponentClub.shortName}</b>
            <Crest club={context.opponentClub} size={20} />
          </div>
          <Lanes board={board} context={context} />
          <Sectors board={board} context={context} />
        </div>
        <div className="stk tac-opp">
          <div className="t">
            <Crest club={context.opponentClub} size={34} />
            <div>
              <b>{context.opponentClub.shortName}</b>
              <span>{isLive ? "Como joga agora" : "Como deve jogar"}</span>
            </div>
          </div>
          <dl>
            <dt>Formação</dt>
            <dd>{opponentTactics.formation}</dd>
            <dt>Postura</dt>
            <dd>{POSTURE_LABEL[opponentTactics.posture]}</dd>
            <dt>Marcação</dt>
            <dd>{MARKING_LABEL[opponentTactics.marking ?? "heavy"]}</dd>
            {context.opponentForm.length > 0 && (
              <>
                <dt>Últimos {context.opponentForm.length}</dt>
                <dd className="fm" aria-label={context.opponentForm.map((r) => RESULT_NAME[r]).join(", ")}>
                  {context.opponentForm.map((result, i) => (
                    <i key={i} className={result} aria-hidden="true">
                      {RESULT_LETTER[result]}
                    </i>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>
      </aside>
    </section>
  );
}
