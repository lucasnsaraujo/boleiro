import { useEffect, useState, type ReactNode } from "react";
import type { Club } from "@boleiro/data/clubs";
import { FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { MAX_SAVED_TACTICS, type MatchPlan, type MinuteSub } from "@boleiro/engine/sim/coach/matchPlan";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { MatchPlanView } from "@boleiro/game-client/engine/createEngineSession";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Select, type SelectOption } from "../controls/Select.js";
import { Crest } from "../clubs/Crest.js";
import { mainRole, ROLE_LETTER, ROLE_NAME } from "./lineupBoard.js";
import { planKeyProblem, redCardExample, shapeName, type PlanKey } from "./matchPlanDraft.js";
import { MARKING_LABEL, PLAY_LABEL, POSTURE_LABEL } from "./tacticsLabels.js";
import "./matchPlanPanel.css";

type ClubFace = Pick<Club, "id" | "shortName" | "colours">;

type Props = {
  club: ClubFace;
  squad: readonly SquadPlayer[];
  /** The eleven on the lineup sheet behind the panel: the plan names a substitute for each of them. */
  lineup: readonly string[];
  /** The tactics on the sheet behind the panel, which the coach can keep as one of his saved tactics. */
  tactics: Tactics;
  view: MatchPlanView;
  /** Keeps the plan; throws when the game refuses it. */
  onSave: (plan: MatchPlan) => Promise<void>;
  onClose: () => void;
};

const ENERGY_FLOORS = [40, 50, 60, 70] as const;
const PLANNED_MINUTES = [30, 45, 55, 60, 65, 70, 75, 80, 85] as const;
const KICKS = 5;
const MOST_MINUTE_SUBS = 5;
const ROWS_OF_LINE: readonly PositionGroup[] = ["ATT", "MID", "DEF"];
const LINE_WORD: Record<PositionGroup, string> = { GK: "goleiro", DEF: "defensor", MID: "meio-campista", ATT: "atacante" };

const energyOf = (p: SquadPlayer) => Math.max(0, 100 - p.fatigue);
// Above this much energy a starter counts as rested, as the lineup sheet's energy bars stay green.
const RESTED = 85;
const minuteLabel = (minute: number) => (minute === 45 ? "Intervalo" : `${minute}'`);

/** The plan without its empty parts, as the game keeps it: a rule switched off is left out. */
function tidy(plan: MatchPlan): MatchPlan {
  const kept: MatchPlan = { ...plan };
  if (!kept.keepsShape) delete kept.keepsShape;
  if (!Object.keys(kept.namedSubs ?? {}).length) delete kept.namedSubs;
  if (!kept.minuteSubs?.length) delete kept.minuteSubs;
  if (!kept.savedTactics?.length) delete kept.savedTactics;
  if (!kept.kickerOrder?.length) delete kept.kickerOrder;
  if (!kept.asksBeforeShootout) delete kept.asksBeforeShootout;
  return kept;
}

function Position({ player }: { player: SquadPlayer }) {
  const role = mainRole(player);
  return (
    <span className={`pos ${ROLE_LETTER[role]}`} title={ROLE_NAME[role]}>
      {ROLE_LETTER[role]}
    </span>
  );
}

/** One rule of the plan: its name and what it is for, its control, what it does with the coach's side, and a picture of it. */
function Rule({ name, hint, control, effect, figure, className }: { name: string; hint: string; control: ReactNode; effect?: ReactNode; figure?: ReactNode; className?: string }) {
  return (
    <div className={className ? `pln-rule ${className}` : "pln-rule"}>
      <div className="nm">
        <b>{name}</b>
        <span>{hint}</span>
      </div>
      <div className="ctl">
        {control}
        {effect && <div className="eff">{effect}</div>}
      </div>
      {figure}
    </div>
  );
}

function Seg<T extends string | number>({ label, options, value, labelOf, onPick }: { label: string; options: readonly T[]; value: T; labelOf: (option: T) => string; onPick: (option: T) => void }) {
  return (
    <div className="tac-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} aria-pressed={value === option} onClick={() => onPick(option)}>
          {labelOf(option)}
        </button>
      ))}
    </div>
  );
}

/**
 * The coach's formation as dots, line by line, playing out what keeping the shape does when a defender is
 * sent off: the card lands on a centre-back, a man of the line that gives way walks off, and a defender
 * runs on into the gap. It plays once each time the rule is switched on or the formation changes.
 */
function ShapeKeeping({ formation, isOn }: { formation: Formation; isOn: boolean }) {
  const { before, after, payer } = redCardExample(formation);
  const victim = Math.floor((before.DEF - 1) / 2);
  return (
    <figure className={isOn ? "pln-shape on" : "pln-shape"} aria-label={`${shapeName(before)} com um defensor expulso fica ${shapeName(after)}`}>
      <div className="pln-pitch" key={`${formation}-${isOn}`} aria-hidden="true">
        {ROWS_OF_LINE.map((line) => (
          <div key={line} className={`pln-line ${line}`}>
            {Array.from({ length: before[line] }, (_, i) => {
              const isSentOff = line === "DEF" && i === victim;
              const isLeaving = line === payer && i === before[line] - 1;
              return (
                <i key={i} className={isSentOff ? "dot off" : isLeaving ? "dot out" : "dot"}>
                  {isSentOff && <b className="pln-red" />}
                </i>
              );
            })}
          </div>
        ))}
        {payer && <i className="dot in" style={{ ["--slot" as string]: (victim + 0.5) / before.DEF }} />}
        <i className="dot gk" />
      </div>
      <figcaption>
        <span className="pln-from">{shapeName(before)}</span>
        <i className="ph-bold ph-arrow-right" aria-hidden="true" />
        <span className="pln-to">{shapeName(after)}</span>
        <small>
          {payer ? `Defensor expulso: sai um ${LINE_WORD[payer]}, entra um defensor.` : "Defensor expulso: ninguém pode sair, o time segue com dez."}
        </small>
      </figcaption>
    </figure>
  );
}

/** A key on the shared keyboard, set by pressing it: Escape gives up, Backspace clears it. */
function KeyCap({ label, value, problemOf, onSet }: { label: string; value: string | undefined; problemOf: (key: string) => string | null; onSet: (key: string | undefined) => void }) {
  const [isListening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isListening) return;
    // Caught on the way down, before the game's shortcuts and the panel's Escape see it.
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab" || event.key === "Shift") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return setListening(false);
      if (event.key === "Backspace" || event.key === "Delete") {
        onSet(undefined);
        setProblem(null);
        return setListening(false);
      }
      const why = problemOf(event.key);
      setProblem(why);
      if (why) return;
      onSet(event.key.toLowerCase());
      setListening(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isListening, problemOf, onSet]);

  return (
    <div className="pln-key">
      <span className="pln-key-label">{label}</span>
      <button
        className={isListening ? "pln-cap listening" : value ? "pln-cap" : "pln-cap empty"}
        aria-label={`${label}: ${isListening ? "aperte uma tecla" : value ? value.toUpperCase() : "nenhuma"}`}
        aria-pressed={isListening}
        onClick={() => {
          setProblem(null);
          setListening(!isListening);
        }}
        onBlur={() => setListening(false)}
      >
        {isListening ? "…" : value ? value.toUpperCase() : "—"}
      </button>
      <span className={problem ? "pln-key-note bad" : "pln-key-note"} role={problem ? "alert" : undefined}>
        {problem ?? (isListening ? "Aperte uma letra ou número. Esc desiste, ⌫ apaga." : value ? "Clique pra trocar" : "Sem tecla")}
      </span>
    </div>
  );
}

/** A saved tactics as a sticker: its place, formation dots, posture, marking and play. */
function SavedSticker({ index, tactics, onRemove }: { index: number; tactics: Tactics; onRemove: () => void }) {
  return (
    <li className="stk pln-slot" style={{ ["--tilt" as string]: `${index % 2 ? 1.2 : -1.2}deg` }}>
      <span className="pln-slot-no">{index + 1}</span>
      <span className="pln-slot-mini" aria-hidden="true">
        {FORMATIONS[tactics.formation].map((slot, i) => (
          <i key={i} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} />
        ))}
      </span>
      <span className="pln-slot-txt">
        <b>{tactics.formation}</b>
        <small>
          {POSTURE_LABEL[tactics.posture]} · {MARKING_LABEL[tactics.marking ?? "heavy"]} · {tactics.play ? PLAY_LABEL[tactics.play] : "Mista"}
        </small>
      </span>
      <button className="pln-x" aria-label={`Tirar a tática ${index + 1}`} onClick={onRemove}>
        <i className="ph-bold ph-x" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The match plan, the coach's page of what his side does while the round runs without him: keep the
 * shape on a red card or an injury, a named substitute for each starter, take off whoever runs out of
 * energy, substitutions at set minutes; on the right his keys, his saved tactics and his penalty takers.
 * Every change is kept at once.
 */
export function MatchPlanPanel({ club, squad, lineup, tactics, view, onSave, onClose }: Props) {
  const title = useDialogFocus<HTMLHeadingElement>(true);
  const [plan, setPlan] = useState<MatchPlan>(view.plan);
  const [failure, setFailure] = useState<string | null>(null);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const starters = lineup.flatMap((id) => byId.get(id) ?? []);
  const bench = squad.filter((p) => !lineup.includes(p.id) && p.status === null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function change(next: MatchPlan) {
    const before = plan;
    const kept = tidy(next);
    setPlan(kept);
    setFailure(null);
    try {
      await onSave(kept);
    } catch {
      setPlan(before);
      setFailure("O plano não mudou. Tente de novo.");
    }
  }

  const benchOptions = (forPlayer?: SquadPlayer): SelectOption<string>[] => {
    const sameLine = bench.filter((p) => !forPlayer || p.group === forPlayer.group);
    const others = forPlayer ? bench.filter((p) => p.group !== forPlayer.group) : [];
    const option = (p: SquadPlayer, group: string) => ({ value: p.id, label: `${ROLE_LETTER[mainRole(p)]} · ${p.name} · ${p.strength}`, group });
    return [...sameLine.map((p) => option(p, forPlayer ? "Mesma posição" : "Banco")), ...others.map((p) => option(p, "Outras posições"))];
  };
  const starterOptions: SelectOption<string>[] = starters.map((p) => ({ value: p.id, label: `${ROLE_LETTER[mainRole(p)]} · ${p.name}` }));

  // Energy: the starter who starts the match most tired, if any of them is.
  const tiredest = [...starters].filter((p) => p.group !== "GK" && energyOf(p) < RESTED).sort((a, b) => energyOf(a) - energyOf(b))[0];
  const floor = plan.energyFloor ?? 0;

  const minuteSubs = plan.minuteSubs ?? [];
  const setMinuteSub = (index: number, sub: MinuteSub) => void change({ ...plan, minuteSubs: minuteSubs.map((s, i) => (i === index ? sub : s)) });
  // A new planned substitution starts with the first outfield starter not planned off, for the best of his line on the bench.
  const addMinuteSub = () => {
    const off = starters.find((p) => p.group !== "GK" && !minuteSubs.some((s) => s.offId === p.id));
    const free = bench.filter((p) => !minuteSubs.some((s) => s.onId === p.id)).sort((a, b) => b.strength - a.strength);
    const on = free.find((p) => p.group === off?.group) ?? free.find((p) => p.group !== "GK");
    if (off && on) void change({ ...plan, minuteSubs: [...minuteSubs, { minute: 70, offId: off.id, onId: on.id }] });
  };

  const saved = plan.savedTactics ?? [];
  const isSavedNow = saved.some((t) => t.formation === tactics.formation && t.posture === tactics.posture && t.marking === tactics.marking && t.play === tactics.play);
  const keyProblemOf = (which: PlanKey) => (key: string) => planKeyProblem(key, which, plan, view.keysTaken);

  const order = plan.kickerOrder ?? [];
  const kickerOptions: SelectOption<string>[] = [
    { value: "", label: "Automático" },
    ...starters.filter((p) => p.group !== "GK").map((p) => ({ value: p.id, label: p.name, group: "Titulares" })),
    ...bench.filter((p) => p.group !== "GK").map((p) => ({ value: p.id, label: p.name, group: "Banco" })),
    ...squad.filter((p) => p.group === "GK").map((p) => ({ value: p.id, label: p.name, group: "Goleiros" })),
  ];
  const setKicker = (index: number, playerId: string) => {
    const next = Array.from({ length: KICKS }, (_, i) => order[i] ?? "");
    const already = next.indexOf(playerId);
    if (playerId && already >= 0) next[already] = next[index] ?? "";
    next[index] = playerId;
    void change({ ...plan, kickerOrder: next.filter((id) => id !== "") });
  };

  return (
    <section className="tac pln" role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className="page pln-rules">
        <header className="tac-hd pln-hd">
          <Crest club={club} size={34} />
          <div>
            <h2 id="plan-title" ref={title} tabIndex={-1}>
              Plano de jogo
            </h2>
            <p className="pln-sub">O que o {club.shortName} faz sozinho, sem parar a rodada.</p>
          </div>
          {failure && (
            <p className="status error pln-fail" role="alert">
              {failure}
            </p>
          )}
        </header>

        {view.isFinalsOnly && (
          <p className="pln-house">
            <i className="ph-bold ph-lock-simple" aria-hidden="true" />
            <span>
              <b>Regra da casa:</b> fora das finais ninguém mexe no time durante o jogo. Só este plano age.
            </span>
          </p>
        )}

        <Rule
          name="Expulsão e lesão"
          hint="Repõe sem parar o jogo"
          className="pln-shape-rule"
          control={
            <Seg label="Expulsão e lesão" options={["ask", "keep"] as const} value={plan.keepsShape ? "keep" : "ask"} labelOf={(o) => (o === "keep" ? "Manter o desenho" : "Me perguntar")} onPick={(o) => void change({ ...plan, keepsShape: o === "keep" || undefined })} />
          }
          effect={
            plan.keepsShape ? (
              <span className="k">Machucou: entra o reserva dele, ou o melhor da posição. Expulso: a linha de trás se mantém.</span>
            ) : (
              <span className="k">A janela abre e você decide. O reserva de cada titular, abaixo, ainda entra se ele machucar.</span>
            )
          }
          figure={<ShapeKeeping formation={tactics.formation} isOn={plan.keepsShape === true} />}
        />

        <Rule
          name="Energia"
          hint="Tira quem cansou"
          control={<Seg label="Energia" options={[0, ...ENERGY_FLOORS] as const} value={floor} labelOf={(o) => (o === 0 ? "Desligado" : `${o}%`)} onPick={(o) => void change({ ...plan, energyFloor: o === 0 ? undefined : o })} />}
          effect={
            floor === 0 ? (
              <span className="k">Ninguém sai por cansaço.</span>
            ) : (
              <>
                <span className="k">Sai quem ficar abaixo de {floor}%. Um jogo inteiro gasta uns 40%, mais nos veteranos; o goleiro fica.</span>
                {tiredest ? (
                  <span>
                    Mais cansado hoje: <b>{tiredest.name}</b>, {energyOf(tiredest)}%
                  </span>
                ) : (
                  <span>Titulares descansados hoje.</span>
                )}
              </>
            )
          }
        />

        <Rule
          name="Trocas marcadas"
          hint="Num minuto certo"
          control={
            <div className="pln-subs">
              {minuteSubs.length === 0 && <span className="pln-none">Nenhuma troca marcada.</span>}
              <ol aria-label="Trocas marcadas">
                {minuteSubs.map((sub, index) => (
                  <li key={index} className="pln-sub-row">
                    <Select label={`Minuto da troca ${index + 1}`} caption={null} value={String(sub.minute)} options={PLANNED_MINUTES.map((m) => ({ value: String(m), label: minuteLabel(m) }))} onChange={(value) => setMinuteSub(index, { ...sub, minute: Number(value) })} />
                    <span className="pln-arrow out">Sai</span>
                    <Select label={`Quem sai na troca ${index + 1}`} caption={null} value={sub.offId} options={starterOptions} onChange={(offId) => setMinuteSub(index, { ...sub, offId })} />
                    <span className="pln-arrow in">Entra</span>
                    <Select label={`Quem entra na troca ${index + 1}`} caption={null} value={sub.onId} options={benchOptions(byId.get(sub.offId))} onChange={(onId) => setMinuteSub(index, { ...sub, onId })} />
                    <button className="pln-x" aria-label={`Tirar a troca ${index + 1}`} onClick={() => void change({ ...plan, minuteSubs: minuteSubs.filter((_, i) => i !== index) })}>
                      <i className="ph-bold ph-x" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
              {minuteSubs.length < MOST_MINUTE_SUBS && bench.length > 0 && (
                <button className="btn sm pln-add" onClick={addMinuteSub}>
                  <i className="ph-bold ph-plus" aria-hidden="true" />
                  Marcar troca
                </button>
              )}
            </div>
          }
        />

        <Rule
          name="Reserva de cada um"
          hint="Quem entra se ele machucar ou cansar"
          className="pln-named-rule"
          control={
            <ul className="pln-named" aria-label="Reserva de cada titular">
              {starters.map((p) => (
                <li key={p.id}>
                  <Position player={p} />
                  <span className="pln-named-nm">{p.name}</span>
                  <Select
                    label={`Reserva de ${p.name}`}
                    caption={null}
                    value={plan.namedSubs?.[p.id] ?? ""}
                    options={[{ value: "", label: "Automático" }, ...benchOptions(p)]}
                    onChange={(subId) => {
                      const others = Object.entries(plan.namedSubs ?? {}).filter(([starterId]) => starterId !== p.id);
                      void change({ ...plan, namedSubs: Object.fromEntries(subId ? [...others, [p.id, subId]] : others) });
                    }}
                  />
                </li>
              ))}
            </ul>
          }
        />

        <footer className="tac-acts">
          <button className="btn" onClick={onClose}>
            <i className="ph-bold ph-arrow-left" aria-hidden="true" />
            Escalação
          </button>
          <span className="n">Vale em todos os jogos até você mudar. Fica guardado na hora.</span>
        </footer>
      </div>

      <aside className="tac-side pln-side">
        <div className="stk pln-card pln-keys">
          <h3>Teclas no jogo</h3>
          <p className="pln-card-sub">{view.keysTaken.length ? "Um teclado pra todos: cada técnico com as suas." : "Funcionam com a rodada rodando."}</p>
          <KeyCap label="Trocar tática" value={plan.tacticsKey} problemOf={keyProblemOf("tacticsKey")} onSet={(key) => void change({ ...plan, tacticsKey: key })} />
          <KeyCap label="Tempo técnico" value={plan.timeOutKey} problemOf={keyProblemOf("timeOutKey")} onSet={(key) => void change({ ...plan, timeOutKey: key })} />
          {view.keysTaken.length > 0 && (
            <p className="pln-taken">
              Já usadas:{" "}
              {view.keysTaken.map(({ key, coachName }) => (
                <span key={key}>
                  <kbd>{key.toUpperCase()}</kbd> {coachName}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="stk pln-card pln-saved">
          <h3>
            Táticas salvas
            {plan.tacticsKey && (
              <small>
                <kbd>{plan.tacticsKey.toUpperCase()}</kbd> passa pra próxima
              </small>
            )}
          </h3>
          <ol className="pln-slots" aria-label="Táticas salvas">
            {saved.map((t, index) => (
              <SavedSticker key={`${index}-${t.formation}-${t.posture}`} index={index} tactics={t} onRemove={() => void change({ ...plan, savedTactics: saved.filter((_, i) => i !== index) })} />
            ))}
          </ol>
          {saved.length < MAX_SAVED_TACTICS && (
            <button className="pln-keep" disabled={isSavedNow} onClick={() => void change({ ...plan, savedTactics: [...saved, { ...tactics, penaltyTakerId: null }] })}>
              <i className="ph-bold ph-push-pin" aria-hidden="true" />
              {isSavedNow ? "A tática de agora já está salva" : `Guardar a de agora: ${tactics.formation} · ${POSTURE_LABEL[tactics.posture].toLowerCase()}`}
            </button>
          )}
        </div>

        <div className="stk pln-card pln-pens">
          <h3>Pênaltis</h3>
          <ol className="pln-kicks" aria-label="Ordem dos pênaltis">
            {Array.from({ length: KICKS }, (_, index) => (
              <li key={index}>
                <span className="pln-kick-no">{index + 1}º</span>
                <Select label={`${index + 1}º batedor`} caption={null} value={order[index] ?? ""} options={kickerOptions} onChange={(playerId) => setKicker(index, playerId)} />
              </li>
            ))}
          </ol>
          <label className="pln-ask">
            <span>
              <b>Bater sem perguntar</b>
              <small>{plan.asksBeforeShootout ? "A rodada para e pergunta a ordem." : "Nessa ordem, sem parar a rodada."}</small>
            </span>
            <input type="checkbox" role="switch" checked={!plan.asksBeforeShootout} onChange={(event) => void change({ ...plan, asksBeforeShootout: !event.target.checked || undefined })} />
            <span className={plan.asksBeforeShootout ? "sw" : "sw on"} aria-hidden="true" />
          </label>
        </div>
      </aside>
    </section>
  );
}
