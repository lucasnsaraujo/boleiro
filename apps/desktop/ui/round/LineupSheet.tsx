import { useState } from "react";
import { createPortal } from "react-dom";
import type { Club } from "@boleiro/data/clubs";
import { FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import type { Posture } from "@boleiro/engine/engine/match";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { useDialogFocus } from "../app/useDialogFocus.js";
import {
  bringOn,
  canBringOn,
  canPick,
  changeTactics,
  lineupProblem,
  openSheet,
  pick,
  subsLeft,
  undo,
  type Sheet,
  type SheetMode,
} from "./lineupDraft.js";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { pitchSpots } from "./pitchSpots.js";
import "./lineupSheet.css";

const FORMATION_NAMES = Object.keys(FORMATIONS) as Formation[];
const POSTURES: readonly { value: Posture; label: string }[] = [
  { value: "defensive", label: "Defensiva" },
  { value: "balanced", label: "Equilibrada" },
  { value: "attacking", label: "Ofensiva" },
];
const GROUP_LABEL: Record<SquadPlayer["group"], string> = { GK: "GOL", DEF: "DEF", MID: "MEI", ATT: "ATA" };
const STATUS_LABEL = { injured: "machucado", suspended: "suspenso" } as const;
const KEEPER_SHIRT = { primary: "#f2d03b", secondary: "#1a1600" };
// Up to this long, the shirt label keeps the whole name; past it, the surname.
const SHIRT_NAME_LENGTH = 13;

type Props = {
  sub: string;
  squad: readonly SquadPlayer[];
  lineup: readonly string[];
  tactics: Tactics;
  mode: SheetMode;
  colours: Club["colours"];
  doneLabel: string;
  isBusy: boolean;
  error: string | null;
  onDone: (sheet: Sheet) => void;
  /** Before kick-off, the way back to the hub. */
  onLeave?: () => void;
};

function shirtName(name: string): string {
  if (name.length <= SHIRT_NAME_LENGTH) return name;
  const words = name.split(" ");
  const last = words.at(-1) ?? name;
  const before = words.at(-2);
  return before && /^d[aeo]s?$/.test(before) ? `${before} ${last}` : last;
}

function Shirt({ colours }: { colours: Club["colours"] }) {
  return (
    <svg className="shirt" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M13 3l-9 5 3 9 5-2v22h16V15l5 2 3-9-9-5c-1 3-4 5-7 5s-6-2-7-5z" fill={colours.primary} stroke={colours.secondary} strokeWidth="2" />
    </svg>
  );
}

function hintOf(sheet: Sheet, mode: SheetMode, squad: readonly SquadPlayer[], problem: string | null): string {
  const picked = squad.find((p) => p.id === sheet.picked);
  if (picked) return `Sai ${picked.name}. Quem entra?`;
  if (mode.kind === "live" && subsLeft(sheet, mode) === 0) return "Sem trocas.";
  return problem ?? "Toque num titular e depois em quem entra.";
}

/** The lineup sheet: shirts on the pitch, tactics and the bench, before kick-off or during the coach's match. */
export function LineupSheet({ sub, squad, lineup, tactics, mode, colours, doneLabel, isBusy, error, onDone, onLeave }: Props) {
  const [sheet, setSheet] = useState(() => openSheet(lineup, tactics));
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const byId = new Map(squad.map((p) => [p.id, p]));
  const starters = sheet.lineup.flatMap((id) => byId.get(id) ?? []);
  const spots = pitchSpots(starters, sheet.tactics.formation);
  const bench = squad.filter((p) => !sheet.lineup.includes(p.id));
  const problem = mode.kind === "preMatch" ? lineupProblem(sheet.lineup, squad) : null;
  const isLive = mode.kind === "live";
  const sentOff = isLive ? mode.sentOff : new Set<string>();
  const hurt = isLive ? mode.hurt : new Set<string>();
  const cameOff = new Set([...(isLive ? mode.cameOff : []), ...sheet.subs.map((s) => s.offId)]);
  const takers = starters.filter((p) => p.group !== "GK" && !sentOff.has(p.id));
  const posture = POSTURES.find((p) => p.value === sheet.tactics.posture)?.label.toLowerCase() ?? "";

  const tagOf = (p: SquadPlayer) => (p.status ? STATUS_LABEL[p.status] : cameOff.has(p.id) ? "saiu" : null);

  return createPortal(
    <div className="sheet-wrap">
      <section className={isLive ? "lineup" : "lineup lineup-prematch"} role="dialog" aria-modal="true" aria-labelledby="lineup-title">
        <header className="lineup-head">
          <h2 id="lineup-title" ref={title} tabIndex={-1}>
            Escalação
          </h2>
          <span className="lineup-sub">
            {sub} · {sheet.tactics.formation} · {posture}
          </span>
          {isLive && (
            <span className="lineup-subs">
              Trocas <b>{subsLeft(sheet, mode)}</b>
            </span>
          )}
        </header>

        <div className="pitch-col">
          <div className="pitch" role="group" aria-label="Titulares">
            <i className="mark half" />
            <i className="mark circle" />
            <i className="mark box-l" />
            <i className="mark box-r" />
            {starters.map((p, order) => {
              const spot = spots.get(p.id) ?? { x: 50, y: 50 };
              const classes = ["pitch-player", sheet.picked === p.id && "sel", hurt.has(p.id) && "hurt", sentOff.has(p.id) && "off"].filter(Boolean).join(" ");
              return (
                <button
                  key={p.id}
                  className={classes}
                  style={{ left: `${spot.x}%`, top: `${spot.y}%`, ["--lineup-order" as string]: order }}
                  aria-label={p.name}
                  aria-pressed={sheet.picked === p.id}
                  disabled={!canPick(sheet, mode, p.id)}
                  onClick={() => setSheet((s) => pick(s, mode, p.id))}
                >
                  <Shirt colours={p.group === "GK" ? KEEPER_SHIRT : colours} />
                  <span className="nm">
                    {sentOff.has(p.id) && <i className="lineup-red-mark" />}
                    {shirtName(p.name)}
                    <span className="st">{p.strength}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="tactics">
            <div>
              <h3 id="formation-title">Formação</h3>
              <div className="lineup-seg" role="group" aria-labelledby="formation-title">
                {FORMATION_NAMES.map((formation) => (
                  <button key={formation} aria-pressed={sheet.tactics.formation === formation} onClick={() => setSheet((s) => changeTactics(s, { formation }))}>
                    {formation}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 id="posture-title">Postura</h3>
              <div className="lineup-seg" role="group" aria-labelledby="posture-title">
                {POSTURES.map(({ value, label }) => (
                  <button key={value} aria-pressed={sheet.tactics.posture === value} onClick={() => setSheet((s) => changeTactics(s, { posture: value }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 id="penalty-title">Pênalti</h3>
              <select
                aria-labelledby="penalty-title"
                value={sheet.tactics.penaltyTakerId ?? ""}
                onChange={(event) => {
                  const penaltyTakerId = event.target.value || null;
                  setSheet((s) => changeTactics(s, { penaltyTakerId }));
                }}
              >
                <option value="">Automático</option>
                {takers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="bench" aria-labelledby="bench-title">
          <div className="bench-head">
            <h3 id="bench-title">Banco</h3>
            <span>Fôlego</span>
            <span>Força</span>
          </div>
          <ul aria-labelledby="bench-title">
            {bench.map((p) => {
              const tag = tagOf(p);
              const isIn = sheet.subs.some((s) => s.onId === p.id);
              const rest = 100 - p.fatigue;
              return (
                <li key={p.id}>
                  <button className={isIn ? "brow in" : "brow"} aria-label={p.name} disabled={!canBringOn(sheet, mode, p)} onClick={() => setSheet((s) => bringOn(s, mode, p))}>
                    <span className="g">{GROUP_LABEL[p.group]}</span>
                    <span className="n">{p.name}</span>
                    <span className="tag">{tag}</span>
                    <span className={rest < 60 ? "fol low" : "fol"} title={`Fôlego ${rest}%`}>
                      <i style={{ width: `${rest}%` }} />
                    </span>
                    <span className="s">{p.strength}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="lineup-foot">
          <span className="hint" role="status">
            {error ?? hintOf(sheet, mode, squad, problem)}
          </span>
          {onLeave && (
            <button className="btn-quiet" onClick={onLeave}>
              Voltar ao clube
            </button>
          )}
          <button className="ghost" disabled={sheet.history.length === 0} onClick={() => setSheet(undo)}>
            Desfazer
          </button>
          <button className="btn-main" disabled={problem !== null || isBusy} onClick={() => onDone(sheet)}>
            {doneLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
