import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Club } from "@boleiro/data/clubs";
import { FORMATION_NAMES, FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { Select } from "../controls/Select.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { useSound } from "../sound/SoundProvider.js";
import { benchHints, mainRole, placedStrength, placeStarters, ROLE_LETTER, ROLE_NAME, teamStrength, type PlacedStarter } from "./lineupBoard.js";
import {
  bringOn,
  canBringOn,
  canComeOn,
  canPick,
  canSwapIn,
  changeTactics,
  lineupProblem,
  openSheet,
  pick,
  pickTeam,
  subsLeft,
  swapIn,
  undo,
  type Sheet,
  type SheetMode,
} from "./lineupDraft.js";
import { hasOwnArrows } from "./hasOwnArrows.js";
import { useBenchDrag, type BenchDrag } from "./useBenchDrag.js";
import { MARKING_LABEL, PLAY_LABEL, POSTURE_LABEL, POSTURES } from "./tacticsLabels.js";
import { TacticsPanel, type TacticsContext } from "./TacticsPanel.js";
import { MatchPlanPanel } from "./MatchPlanPanel.js";
import type { MatchPlan } from "@boleiro/engine/sim/coach/matchPlan";
import type { MatchPlanView } from "@boleiro/game-client/engine/createEngineSession";
import "./lineupSheet.css";

const STATUS_LABEL = { injured: "Machucado", suspended: "Suspenso", facesOwner: "Não enfrenta o dono", onDuty: "Na seleção" } as const;
// Up to this long, the sticker keeps the whole name; past it, the surname.
const SHIRT_NAME_LENGTH = 12;
// Below this much energy a player is marked tired, as the bench's energy bars turn amber and then red.
const TIRED = 70;
const RESTED = 85;

/** The opponent's card: its club and the formation its coach plays. */
type Opponent = { club: Pick<Club, "id" | "shortName" | "colours">; formation: Formation };

/** In a hot-seat round, whose match the sheet shows among the human coaches' and the way to the next one, with the sheet as it stands. */
export type CoachStep = { name: string; place: number; count: number; onStep: (sheet: Sheet, step: 1 | -1) => void };

type Props = {
  sub: string;
  squad: readonly SquadPlayer[];
  lineup: readonly string[];
  tactics: Tactics;
  mode: SheetMode;
  doneLabel: string;
  isBusy: boolean;
  error: string | null;
  onDone: (sheet: Sheet) => void;
  /** Before kick-off, the way back to the hub. */
  onLeave?: () => void;
  /** Before kick-off, the assistant's best eleven for a formation (Escalar time). */
  onPickTeam?: (formation: Formation) => Promise<readonly string[]>;
  /** Before kick-off, the assistant's eleven in the coach's formation when the sheet opens on another (the coach's own last eleven). */
  assistantLineup?: readonly string[];
  opponent?: Opponent;
  coachStep?: CoachStep;
  /** What the tactics panel needs to open from the sheet. */
  tacticsContext?: TacticsContext;
  /** Before kick-off, the club's chemistry meter and its captain, whom the coach can change. */
  chemistry?: Captaincy;
  /** Before kick-off, the coach's talk to his side, over the sheet's foot. */
  talk?: ReactNode;
  /** Before kick-off, the way to the coach's match plan: his club, and how the plan is read and kept. */
  matchPlan?: PlanAccess;
};

/** What the lineup sheet needs to open the coach's match plan over it. */
type PlanAccess = { club: Pick<Club, "id" | "shortName" | "colours">; load: () => Promise<MatchPlanView>; save: (plan: MatchPlan) => Promise<void> };

/** The club's chemistry meter, its captain, the assistant's pick for the armband, and how the coach names another. */
type Captaincy = { value: number; captainId: string | null; suggestedId: string | null; onName: (playerId: string) => Promise<number> };

function shirtName(name: string): string {
  if (name.length <= SHIRT_NAME_LENGTH) return name;
  const words = name.split(" ");
  const last = words.at(-1) ?? name;
  const before = words.at(-2);
  return before && /^d[aeo]s?$/.test(before) ? `${before} ${last}` : last;
}

function hintOf(sheet: Sheet, mode: SheetMode, squad: readonly SquadPlayer[], problem: string | null, drag: BenchDrag | null): string {
  if (drag) {
    const over = squad.find((p) => p.id === drag.overId);
    return over ? `Sai ${over.name}, entra ${drag.player.name}.` : `Solte ${drag.player.name} sobre quem sai.`;
  }
  const picked = squad.find((p) => p.id === sheet.picked);
  if (picked) return `Sai ${picked.name}. Quem entra?`;
  if (mode.kind === "live" && subsLeft(sheet, mode) === 0) return "Sem trocas.";
  return problem ?? "Toque num titular e depois em quem entra, ou arraste o reserva até ele.";
}

const energyOf = (p: SquadPlayer) => Math.max(0, 100 - p.fatigue);
const energyClass = (energy: number) => (energy < TIRED ? "en low" : energy < RESTED ? "en mid" : "en");
const decimal = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Position({ player }: { player: SquadPlayer }) {
  const role = mainRole(player);
  return (
    <span className={`pos ${ROLE_LETTER[role]}`} title={ROLE_NAME[role]}>
      {ROLE_LETTER[role]}
    </span>
  );
}

function Energy({ player }: { player: SquadPlayer }) {
  const energy = energyOf(player);
  return (
    <span className={energyClass(energy)} title={`Energia ${energy}%`}>
      <i style={{ width: `${energy}%` }} />
    </span>
  );
}

/** The opponent's formation as dots on a small pitch, attacking down towards the coach's goal. */
function MiniPitch({ formation }: { formation: Formation }) {
  return (
    <span className="lineup-mini" aria-hidden="true">
      {FORMATIONS[formation].map((slot, i) => (
        <i key={i} style={{ left: `${100 - slot.x}%`, top: `${100 - slot.y}%` }} />
      ))}
    </span>
  );
}

/** The lineup: the eleven on the pitch where the formation puts them, tactics and the bench, before kick-off or during the coach's match. */
export function LineupSheet({ sub, squad, lineup, tactics, mode, doneLabel, isBusy, error, onDone, onLeave, onPickTeam, assistantLineup, opponent, coachStep, tacticsContext, chemistry, talk, matchPlan }: Props) {
  const [sheet, setSheet] = useState(() => openSheet(lineup, tactics));
  const [captainId, setCaptainId] = useState(chemistry?.captainId ?? null);
  const [captainFailure, setCaptainFailure] = useState<string | null>(null);
  const [chemistryValue, setChemistryValue] = useState(chemistry?.value ?? 0);
  // The captain asked for last: an answer for an earlier pick that lands after it is dropped.
  const latestCaptain = useRef(captainId);
  // The substitute who just came on, whose sticker lands on the pitch.
  const [justIn, setJustIn] = useState<string | null>(null);
  const { engine: sound } = useSound();
  const { drag, startDrag } = useBenchDrag({
    canDrop: (offId, player) => canSwapIn(sheet, mode, offId, player),
    onDrop: (offId, player) => {
      setSheet((s) => swapIn(s, mode, offId, player));
      cameOn(player);
    },
  });
  const [isPicking, setPicking] = useState(false);
  const [isTacticsOpen, setTacticsOpen] = useState(false);
  // The coach's match plan while its page is open over the sheet.
  const [planView, setPlanView] = useState<MatchPlanView | null>(null);
  const [planFailure, setPlanFailure] = useState<string | null>(null);
  const isPageOpen = isTacticsOpen || planView !== null;
  const [pickFailure, setPickFailure] = useState<string | null>(null);
  // The assistant's latest eleven and its formation: the team strength is compared against it.
  const [assistantPick, setAssistantPick] = useState(() => ({ lineup: assistantLineup ?? lineup, formation: tactics.formation }));
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const byId = new Map(squad.map((p) => [p.id, p]));
  const starters = sheet.lineup.flatMap((id) => byId.get(id) ?? []);
  const placed = placeStarters(starters, sheet.tactics.formation);
  const strength = teamStrength(placed);
  const assistant = mode.kind === "preMatch" ? teamStrength(placeStarters(assistantPick.lineup.flatMap((id) => byId.get(id) ?? []), assistantPick.formation)) : strength;
  const bench = squad.filter((p) => !sheet.lineup.includes(p.id));
  const ready = bench.filter((p) => p.status === null);
  const out = bench.filter((p) => p.status !== null);
  const problem = mode.kind === "preMatch" ? lineupProblem(sheet.lineup, squad) : null;
  const isLive = mode.kind === "live";
  const sentOff = isLive ? mode.sentOff : new Set<string>();
  const hurt = isLive ? mode.hurt : new Set<string>();
  const cameOff = new Set([...(isLive ? mode.cameOff : []), ...sheet.subs.map((s) => s.offId)]);
  const takers = starters.filter((p) => p.group !== "GK" && !sentOff.has(p.id));
  const posture = POSTURE_LABEL[sheet.tactics.posture].toLowerCase();
  const order = new Map(placed.map((starter, i) => [starter.player.id, i]));
  const hints = benchHints(bench, placed);

  function cameOn(player: SquadPlayer) {
    setJustIn(player.id);
    sound.play("substitution");
  }

  // ← and → step through the human coaches' matches, taking this one's changes along.
  // A layout effect, so a key pressed the moment the sheet turns to the next match never reaches the last match's listener.
  useLayoutEffect(() => {
    if (!coachStep || isPageOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step || event.defaultPrevented || event.repeat || isBusy || hasOwnArrows(event.target)) return;
      event.preventDefault();
      coachStep.onStep(sheet, step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Opens the match plan's page over the sheet, from the tactics page too. */
  async function openPlan() {
    if (!matchPlan) return;
    setTacticsOpen(false);
    setPlanFailure(null);
    try {
      setPlanView(await matchPlan.load());
    } catch {
      setPlanFailure("O plano de jogo não abriu. Tente de novo.");
    }
  }

  /** Hands the armband to `playerId` at once; the meter follows his standing. */
  async function nameCaptain(playerId: string) {
    if (!chemistry || !playerId) return;
    const before = captainId;
    setCaptainId(playerId);
    setCaptainFailure(null);
    latestCaptain.current = playerId;
    try {
      const value = await chemistry.onName(playerId);
      if (latestCaptain.current === playerId) setChemistryValue(value);
    } catch {
      if (latestCaptain.current !== playerId) return;
      setCaptainId(before);
      setCaptainFailure("O capitão não mudou. Tente de novo.");
    }
  }

  /** The assistant's eleven for the formation asked about; if the coach changed formation meanwhile, it is left out. */
  async function pickBest() {
    if (!onPickTeam) return;
    const { formation } = sheet.tactics;
    setPicking(true);
    setPickFailure(null);
    try {
      const best = await onPickTeam(formation);
      setSheet((s) => (s.tactics.formation === formation ? pickTeam(s, best) : s));
      setAssistantPick({ lineup: best, formation });
    } catch {
      setPickFailure("O auxiliar não conseguiu escalar o time. Tente de novo.");
    } finally {
      setPicking(false);
    }
  }

  const noteOf = (p: SquadPlayer): { text: string; className: string } | null => {
    if (p.status) return { text: STATUS_LABEL[p.status], className: "note" };
    if (cameOff.has(p.id)) return { text: "Saiu", className: "note" };
    const hint = hints.get(p.id);
    if (hint) return { text: hint, className: "chip" };
    return energyOf(p) < TIRED ? { text: "Cansado", className: "note warn" } : null;
  };

  const benchRow = (p: SquadPlayer) => {
    const note = noteOf(p);
    const isIn = sheet.subs.some((s) => s.onId === p.id);
    const canDrag = canComeOn(sheet, mode, p);
    const classes = [p.status && "out", canDrag && "drag", drag?.player.id === p.id && "lifted"].filter(Boolean).join(" ");
    return (
      <li key={p.id} className={classes || undefined} onPointerDown={canDrag ? (event) => startDrag(event, p) : undefined}>
        <button
          className={isIn ? "brow in" : "brow"}
          aria-label={p.name}
          disabled={!canBringOn(sheet, mode, p)}
          onClick={() => {
            setSheet((s) => bringOn(s, mode, p));
            cameOn(p);
          }}
        >
          <Position player={p} />
          <span className="n">
            {p.name}
            {p.id === captainId && (
              <span className="brow-cap" title="Capitão">
                C
              </span>
            )}
          </span>
          <span className="s">{p.strength}</span>
          <span className="e">
            <Energy player={p} />
            <small>{energyOf(p)}%</small>
          </span>
          <span className="t">{note && <span className={note.className}>{note.text}</span>}</span>
        </button>
      </li>
    );
  };

  const sticker = (starter: PlacedStarter) => {
    const { player: p, slot, cost } = starter;
    const shown = placedStrength(starter);
    const classes = [
      "pl",
      cost?.kind === "secondary" && "sec",
      cost?.kind === "improvised" && "imp",
      sheet.picked === p.id && "sel",
      hurt.has(p.id) && "hurt",
      sentOff.has(p.id) && "off",
      drag?.overId === p.id && "drop",
      justIn === p.id && "in",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        key={p.id}
        data-starter={p.id}
        className={classes}
        style={{ left: `${slot.x}%`, top: `${slot.y}%`, ["--lineup-order" as string]: order.get(p.id) ?? 0 }}
        aria-label={p.name}
        aria-pressed={sheet.picked === p.id}
        disabled={!canPick(sheet, mode, p.id)}
        onClick={() => setSheet((s) => pick(s, mode, p.id))}
      >
        {p.id === captainId && (
          <span className="pl-cap" title="Capitão">
            C
          </span>
        )}
        <span className="pl-top">
          <Position player={p} />
          <b>
            {sentOff.has(p.id) && <i className="lineup-red-mark" />}
            {shirtName(p.name)}
          </b>
        </span>
        <span className="pl-bottom">
          <span className="f">
            {shown}
            {shown !== p.strength && <s>{p.strength}</s>}
          </span>
          <Energy player={p} />
          <small>{energyOf(p)}%</small>
        </span>
        {cost && (
          <span className={`pl-tag ${cost.kind}`}>
            {cost.kind === "improvised" && <i className="ph-fill ph-warning" aria-hidden="true" />}
            {cost.text}
          </span>
        )}
      </button>
    );
  };

  return createPortal(
    <div className="sheet-wrap">
      <section className={isLive ? "lineup" : "lineup lineup-prematch"} role="dialog" aria-modal="true" aria-labelledby="lineup-title" inert={isPageOpen}>
        <div className={drag ? "pitch dragging" : "pitch"} role="group" aria-label="Titulares">
          <i className="mark out" />
          <i className="mark half" />
          <i className="mark circle" />
          <i className="mark box top" />
          <i className="mark six top" />
          <i className="mark box bottom" />
          <i className="mark six bottom" />
          <span className="pitch-attack" aria-hidden="true">
            <i className="ph-bold ph-arrow-up" />
            Ataque
          </span>
          {placed.map(sticker)}
        </div>

        <div className="lineup-col">
          <header className="lineup-head">
            <div>
              <h2 id="lineup-title" ref={title} tabIndex={-1}>
                Escalação
              </h2>
              <span className="lineup-sub">
                {sub} · {sheet.tactics.formation} · {posture}
              </span>
            </div>
            {coachStep && (
              <div className="lineup-coach" role="group" aria-label="Jogos dos técnicos">
                <button className="lineup-step" aria-label="Jogo anterior" disabled={isBusy} onClick={() => coachStep.onStep(sheet, -1)}>
                  <i className="ph-bold ph-caret-left" aria-hidden="true" />
                </button>
                <span className="lineup-coach-who">
                  <b>{coachStep.name}</b>
                  <small>
                    {coachStep.place} de {coachStep.count} · <kbd>←</kbd> <kbd>→</kbd>
                  </small>
                </span>
                <button className="lineup-step" aria-label="Próximo jogo" disabled={isBusy} onClick={() => coachStep.onStep(sheet, 1)}>
                  <i className="ph-bold ph-caret-right" aria-hidden="true" />
                </button>
              </div>
            )}
            {isLive && (
              <span className="lineup-subs">
                Trocas <b>{subsLeft(sheet, mode)}</b>
              </span>
            )}
            {opponent && !isLive && (
              <div className="stk lineup-opp">
                <Crest club={opponent.club} size={34} />
                <div>
                  <b>{opponent.club.shortName}</b>
                  <small>{opponent.formation}</small>
                </div>
                <MiniPitch formation={opponent.formation} />
              </div>
            )}
          </header>

          <div className="tactics">
            <div className="lineup-field">
              <h3 id="formation-title">Formação</h3>
              <div className="lineup-seg" role="group" aria-labelledby="formation-title">
                {FORMATION_NAMES.map((formation) => (
                  <button key={formation} aria-pressed={sheet.tactics.formation === formation} onClick={() => setSheet((s) => changeTactics(s, { formation }))}>
                    {formation}
                  </button>
                ))}
              </div>
            </div>
            <div className="lineup-field">
              <h3 id="posture-title">Postura</h3>
              <div className="lineup-seg" role="group" aria-labelledby="posture-title">
                {POSTURES.map((value) => (
                  <button key={value} aria-pressed={sheet.tactics.posture === value} onClick={() => setSheet((s) => changeTactics(s, { posture: value }))}>
                    {POSTURE_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="lineup-field">
              <h3 id="penalty-title">Pênalti</h3>
              <Select
                label="Pênalti"
                caption={null}
                value={sheet.tactics.penaltyTakerId ?? ""}
                options={[{ value: "", label: "Automático" }, ...takers.map((p) => ({ value: p.id, label: p.name }))]}
                onChange={(value) => {
                  const penaltyTakerId = value || null;
                  setSheet((s) => changeTactics(s, { penaltyTakerId }));
                }}
              />
            </div>
            {chemistry && (
              <div className="lineup-field">
                <h3 id="captain-title">Capitão</h3>
                <Select
                  label="Capitão"
                  caption={null}
                  value={captainId ?? ""}
                  options={squad.map((p) => ({ value: p.id, label: p.id === chemistry.suggestedId ? `${p.name} · sugestão do auxiliar` : p.name }))}
                  onChange={(value) => void nameCaptain(value)}
                />
              </div>
            )}
            {tacticsContext && (
              <button className="btn sm lineup-tactics" onClick={() => setTacticsOpen(true)}>
                <i className="ph-bold ph-strategy" aria-hidden="true" />
                Tática
                <small>
                  {MARKING_LABEL[sheet.tactics.marking ?? "heavy"]} · {sheet.tactics.play ? PLAY_LABEL[sheet.tactics.play] : "Mista"}
                </small>
              </button>
            )}
            {matchPlan && (
              <button className="btn sm lineup-tactics" onClick={() => void openPlan()}>
                <i className="ph-bold ph-chalkboard-teacher" aria-hidden="true" />
                Plano de jogo
                <small>trocas, teclas, pênaltis</small>
              </button>
            )}
          </div>

          <section className="page bench" aria-labelledby="bench-title">
            <div className="bench-head">
              <span>P</span>
              <h3 id="bench-title">
                Reservas · {ready.length} de {bench.length}
              </h3>
              <span>F</span>
              <span>Energia</span>
            </div>
            <ul aria-label="Banco">
              {ready.map(benchRow)}
              {out.length > 0 && (
                <li className="bench-group" aria-hidden="true">
                  Fora da lista
                </li>
              )}
              {out.map(benchRow)}
            </ul>
          </section>

          <div className="lineup-hint-row">
            <p className="lineup-hint" role="status">
              {error ?? pickFailure ?? captainFailure ?? planFailure ?? hintOf(sheet, mode, squad, problem, drag)}
            </p>
            {onLeave && (
              <button className="btn flat sm" onClick={onLeave}>
                Voltar ao clube
              </button>
            )}
            <button className="btn flat sm" disabled={sheet.history.length === 0} onClick={() => setSheet(undo)}>
              Desfazer
            </button>
          </div>
          {talk}
          <footer className="lineup-foot">
            <div className="lineup-strength">
              <span>Força do time</span>
              <b>
                {decimal(strength)}
                {mode.kind === "preMatch" && Math.abs(strength - assistant) >= 0.05 && (
                  <small className={strength < assistant ? "down" : "up"}>
                    {strength < assistant ? "−" : "+"}
                    {decimal(Math.abs(strength - assistant))} vs auxiliar
                  </small>
                )}
              </b>
            </div>
            {chemistry && (
              <div className="lineup-strength lineup-chemistry">
                <span>Entrosamento</span>
                <b>{chemistryValue}</b>
              </div>
            )}
            {onPickTeam && (
              <button className="btn" title="O auxiliar escala os 11 melhores na formação" disabled={isPicking} onClick={() => void pickBest()}>
                <i className="ph-bold ph-strategy" aria-hidden="true" />
                Escalar time
              </button>
            )}
            <button className="btn go lg lineup-done" disabled={problem !== null || isBusy} onClick={() => onDone(sheet)}>
              {doneLabel}
              <i className="ph-bold ph-caret-double-right" aria-hidden="true" />
            </button>
          </footer>
        </div>
      </section>
      {tacticsContext && isTacticsOpen && (
        <TacticsPanel
          context={tacticsContext}
          eleven={starters.filter((p) => !sentOff.has(p.id))}
          tactics={sheet.tactics}
          isLive={isLive}
          onChange={(next) => setSheet((s) => changeTactics(s, next))}
          onClose={() => setTacticsOpen(false)}
          {...(matchPlan ? { onOpenPlan: () => void openPlan() } : {})}
        />
      )}
      {matchPlan && planView && (
        <MatchPlanPanel club={matchPlan.club} squad={squad} lineup={sheet.lineup} tactics={sheet.tactics} view={planView} onSave={matchPlan.save} onClose={() => setPlanView(null)} />
      )}
      {drag && (
        <div className={drag.overId ? "lineup-ghost over" : "lineup-ghost"} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Position player={drag.player} />
          <b>{shirtName(drag.player.name)}</b>
          <span className="f">{drag.player.strength}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
