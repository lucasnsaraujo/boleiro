import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FULL_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import { matchPageAt, type MatchView } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage } from "@boleiro/game-client/matchPage/matchPageOf";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { ClubSticker, clubColours, EventMark, GoalNote, LiveChip, RollingDigit, refereeLine, StatBar, venueLine } from "./matchFileParts.js";
import { MatchPitch } from "./MatchPitch.js";
import { MatchSheet } from "./MatchSheet.js";
import "./matchFile.css";

// The panel and the sheet leave over this long before they unmount.
const LEAVE_MS = 260;
const PANEL_STATS = ["possession", "shots", "onTarget"] as const;

type Props = {
  /** The match to show; null keeps the file closed. */
  matchRef: string | null;
  /** The round's clock, for a match being played; past matches show whole. */
  minute?: number;
  /** Anything that changes when the match does, so its page is read again: the live round after a change. */
  version?: unknown;
  /** Offers the coach his substitutions from the panel, on his own match under way. */
  onSubstitute?: () => void;
  onClose: () => void;
};

/** The page of the match `matchRef`, read again whenever `version` changes. The last page stays up while the next one loads. */
function useMatchPage(matchRef: string | null, version: unknown): MatchPage | null {
  const { engine } = useServices();
  const [page, setPage] = useState<MatchPage | null>(null);
  useEffect(() => {
    if (!matchRef) return;
    let isCurrent = true;
    engine.matchPage(matchRef).then(
      (read) => isCurrent && setPage(read),
      () => isCurrent && setPage(null),
    );
    return () => {
      isCurrent = false;
    };
  }, [engine, matchRef, version]);
  return matchRef ? page : null;
}

/**
 * The ficha do jogo: a side panel over the screen, any match swapping into it, and from it the full
 * tabbed sheet. Escape steps back: from the sheet to the panel, then closed.
 */
export function MatchFile({ matchRef, minute = FULL_TIME, version, onSubstitute, onClose }: Props) {
  const page = useMatchPage(matchRef, version);
  const [isFull, setFull] = useState(false);
  // A leave belongs to the match it started on: another match opened meanwhile cancels it.
  const [pendingLeave, setLeave] = useState<{ what: "panel" | "sheet"; matchRef: string | null } | null>(null);
  const leaving = pendingLeave?.matchRef === matchRef ? pendingLeave.what : null;
  // Back from the sheet the panel is already in place: it fades in instead of sliding.
  const [isReturning, setReturning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef(matchRef);
  useEffect(() => {
    shown.current = matchRef;
  }, [matchRef]);

  const leave = useCallback(
    (what: "panel" | "sheet") => {
      const from = shown.current;
      const done = () => {
        setLeave(null);
        if (shown.current !== from) return;
        setFull(false);
        setReturning(what === "sheet");
        if (what === "panel") onClose();
      };
      if (timer.current) clearTimeout(timer.current);
      if (prefersReducedMotion()) return done();
      setLeave({ what, matchRef: from });
      timer.current = setTimeout(done, LEAVE_MS);
    },
    [onClose],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  useEffect(() => {
    if (!matchRef) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("[aria-modal='true']:not(.mf-sheet)")) return;
      event.stopPropagation();
      leave(isFull ? "sheet" : "panel");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [matchRef, isFull, leave]);

  if (!matchRef || !page) return null;
  const view = matchPageAt(page, minute);
  // Under the green bar when the screen has one; over a screen that fills the window, clear of its title-bar buttons.
  const top = document.querySelector(".bar")?.getBoundingClientRect().bottom ?? 0;
  return createPortal(
    <div className="mf" style={{ ["--mf-top" as string]: `${top}px`, ...(top === 0 ? { ["--mf-pad-top" as string]: chromeTop() } : {}) }}>
      {!isFull && (
        <MatchPanel page={page} view={view} isReturning={isReturning} isLeaving={leaving === "panel"} onFull={() => setFull(true)} onClose={() => leave("panel")} {...(onSubstitute && !view.isOver ? { onSubstitute } : {})} />
      )}
      {isFull && <MatchSheet page={page} view={view} isLeaving={leaving !== null} onBack={() => leave("sheet")} onClose={() => leave("panel")} />}
    </div>,
    document.body,
  );
}

/** The band the window's title-bar buttons take at the top, which the app sets on its root (shell.css). */
function chromeTop(): string {
  const app = document.querySelector(".app");
  return (app && getComputedStyle(app).getPropertyValue("--chrome-top").trim()) || "0px";
}

/** Opens any match in a ficha over the screen that holds it: `open` a match, and mount `file`. */
export function useMatchFile(): { open: (matchRef: string) => void; file: ReactNode } {
  const [matchRef, setMatchRef] = useState<string | null>(null);
  return { open: setMatchRef, file: <MatchFile matchRef={matchRef} onClose={() => setMatchRef(null)} /> };
}

type PanelProps = { page: MatchPage; view: MatchView; isReturning: boolean; isLeaving: boolean; onFull: () => void; onClose: () => void; onSubstitute?: () => void };

function MatchPanel({ page, view, isReturning, isLeaving, onFull, onClose, onSubstitute }: PanelProps) {
  const name = (id: string) => page.names[id] ?? "Um jogador";
  const goals = view.events.filter((e) => e.kind === "goal");
  // Yellows go as a count per side; a red card or an injury is news, with its name.
  const yellows = (side: Side) => view.events.filter((e) => e.kind === "yellow" && e.side === side).length;
  const sendOffs = view.events.filter((e) => e.kind === "red" || e.kind === "injury");
  const stats = PANEL_STATS.flatMap((key) => view.stats.find((s) => s.key === key) ?? []);
  const [curiosity] = page.curiosities;
  const title = useDialogFocus<HTMLSpanElement>(true);
  return (
    <aside className={`mf-panel${isReturning ? " entry-return" : ""}${isLeaving ? " leaving" : ""}`} role="dialog" aria-label="Ficha do jogo" style={clubColours(page)}>
      <header className="mf-ph">
        <span ref={title} tabIndex={-1} className="lbl">
          Ficha do jogo · {page.label}
        </span>
        <LiveChip page={page} view={view} />
        <button className="mf-x" aria-label="Fechar a ficha" onClick={onClose}>
          <i className="ph-bold ph-x" aria-hidden="true" />
        </button>
      </header>
      {/* A new match swaps in as a whole: its key replays the entrance. */}
      <div key={page.ref} className="mf-body">
        <div className="mf-score" aria-label={`${page.home.club.shortName} ${view.score.home} x ${view.score.away} ${page.away.club.shortName}`}>
          <ClubSticker page={page} side="home" />
          <div className="mf-digits">
            <RollingDigit value={view.score.home} />
            <span className="mf-times" aria-hidden="true">
              ×
            </span>
            <RollingDigit value={view.score.away} />
          </div>
          <ClubSticker page={page} side="away" />
        </div>
        <p className="mf-venue">{venueLine(page).join(" · ")}</p>
        {refereeLine(page) && <p className="mf-venue mf-ref">{refereeLine(page)}</p>}
        {goals.length > 0 && (
          <ol className="mf-goals" aria-label="Gols">
            {goals.map((g, index) => (
              <li key={`${g.minute}-${g.playerId}-${index}`} className={g.side} style={{ ["--i" as string]: index }}>
                <span className="who">
                  <b>{name(g.playerId)}</b> <GoalNote event={g} names={page.names} />
                </span>
                <span className="mn">{g.minute}'</span>
              </li>
            ))}
          </ol>
        )}
        {yellows("home") + yellows("away") + sendOffs.length > 0 && (
          <div className="mf-books" aria-label="Cartões e lesões">
            {(["home", "away"] as const).map((side) => (
              <ul key={side} className={side}>
                {yellows(side) > 0 && (
                  <li aria-label={`${yellows(side)} amarelos`}>
                    <span className="yc" aria-hidden="true" />
                    <small>×{yellows(side)}</small>
                  </li>
                )}
                {sendOffs
                  .filter((e) => e.side === side)
                  .map((e, index) => (
                    <li key={`${e.kind}-${e.playerId}-${index}`}>
                      <EventMark event={e} />
                      <span>
                        {name(e.playerId)} <small>{e.minute}'</small>
                      </span>
                    </li>
                  ))}
              </ul>
            ))}
          </div>
        )}
        <MatchPitch page={page} view={view} size="panel" />
        {stats.length > 0 && (
          <div className="mf-bars">
            {stats.map((line, index) => (
              <StatBar key={line.key} line={line} index={index} />
            ))}
          </div>
        )}
        {curiosity && (
          <p className="mf-fact">
            <i className="ph-fill ph-star" aria-hidden="true" />
            <span>
              <b>Curiosidade:</b> {curiosity}
            </span>
          </p>
        )}
      </div>
      <footer className="mf-actions">
        {onSubstitute && (
          <button className="btn" onClick={onSubstitute}>
            <i className="ph-bold ph-arrows-left-right" aria-hidden="true" />
            Substituições
          </button>
        )}
        <button className="btn y mf-full" onClick={onFull}>
          Ver ficha completa
          <i className="ph-bold ph-arrow-right" aria-hidden="true" />
        </button>
      </footer>
    </aside>
  );
}
