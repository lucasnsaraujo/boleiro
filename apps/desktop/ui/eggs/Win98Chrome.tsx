import { useEffect, useRef, useState } from "react";
import type { IsoDate } from "@boleiro/engine/sim/gameState";

/** The game's ball as a 16-pixel icon, drawn for the 98 round: white patches, black seams. */
function BallIcon() {
  return (
    <svg className="w98-icon" width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2z" fill="#000" />
      <path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2z" fill="#fff" />
      <path d="M7 5h2v1h1v2H9v1H7V8H6V6h1zM3 6h1v3H3zM12 6h1v3h-1zM6 12h4v1H6zM5 2h2v1H5zM9 2h2v1H9z" fill="#000" />
    </svg>
  );
}

/** "14/01/2026", as the tray clock of the time showed a date. */
const trayDate = (date: IsoDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The window's title bar while the game plays as a 1998 program; its × goes back to 2026. */
export function Win98TitleBar({ title, onLeave }: { title: string; onLeave: () => void }) {
  return (
    <div className="w98-title" data-tauri-drag-region>
      <BallIcon />
      <span className="w98-title-text">{title}</span>
      <span className="w98-caps">
        <span className="w98-cap" aria-hidden="true">
          <svg width="8" height="7" viewBox="0 0 8 7">
            <path d="M1 5h6v2H1z" fill="currentColor" />
          </svg>
        </span>
        <span className="w98-cap" aria-hidden="true">
          <svg width="9" height="8" viewBox="0 0 9 8">
            <path d="M0 0h9v8H0zM1 2v5h7V2z" fill="currentColor" fillRule="evenodd" />
          </svg>
        </span>
        <button className="w98-cap close" aria-label="Voltar para 2026" onClick={onLeave}>
          <svg width="8" height="7" viewBox="0 0 8 7" aria-hidden="true">
            <path d="M0 0h2l2 2 2-2h2L5 3.5 8 7H6L4 5 2 7H0l3-3.5z" fill="currentColor" />
          </svg>
        </button>
      </span>
    </div>
  );
}

/**
 * The taskbar along the bottom while the game plays as a 1998 program: Iniciar opens a menu that goes
 * back to 2026, the game's own task sits pressed beside it, and the tray clock shows the game's day.
 */
export function Win98TaskBar({ task, date, onLeave }: { task: string; date: IsoDate | null; onLeave: () => void }) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isMenuOpen) back.current?.focus();
  }, [isMenuOpen]);

  return (
    <div className="w98-taskbar" role="toolbar" aria-label="Barra de tarefas">
      <div className="w98-start-wrap">
        <button
          ref={start}
          className={isMenuOpen ? "w98-start pressed" : "w98-start"}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setMenuOpen(!isMenuOpen)}
        >
          <BallIcon />
          Iniciar
        </button>
        {isMenuOpen && (
          <div
            className="w98-menu"
            role="menu"
            aria-label="Iniciar"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setMenuOpen(false);
              start.current?.focus();
            }}
          >
            <span className="w98-menu-side" aria-hidden="true">
              <b>Boleiro</b>98
            </span>
            <button
              ref={back}
              className="w98-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onLeave();
              }}
            >
              <BallIcon />
              Voltar para 2026
            </button>
          </div>
        )}
      </div>
      <span className="w98-task" aria-hidden="true">
        <BallIcon />
        {task}
      </span>
      {date && (
        <span className="w98-tray" aria-label={`Data do jogo: ${trayDate(date)}`}>
          {trayDate(date)}
        </span>
      )}
    </div>
  );
}
