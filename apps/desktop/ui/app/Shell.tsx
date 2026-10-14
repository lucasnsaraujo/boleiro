import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel } from "@boleiro/game-client/saves/slotMeta";
import { clubById } from "../clubs/clubCatalog.js";
import { musicFor, useSound } from "../sound/SoundProvider.js";
import { useTheme } from "../theme/ThemeProvider.js";
import { useCommands, useRunCommand } from "./AppCommands.js";
import { GameClockContext } from "./gameClock.js";
import { platformOf } from "./platform.js";
import { screenDirection } from "./screenDirection.js";
import { NAV, navIndexOf, showsBar, type NavId } from "./screens.js";
import { useServices } from "./ServicesContext.js";
import { commandForKey } from "./shortcuts.js";
import "./shell.css";

type Clock = Pick<GameState, "date" | "season"> & { clubName: string | null };
type Toast = { id: number; text: string; isError: boolean };

const PLATFORM = platformOf(navigator.userAgent);
const TOAST_MS = 2600;

function windowTitle(pathname: string, clock: Clock | null): string {
  if (pathname === "/new-game") return "Boleiro · Nova carreira";
  if (!clock || pathname === "/") return "Boleiro";
  return `Boleiro · ${clock.clubName ?? "Sem clube"} ${clock.season}`;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

export function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { engine, slots, game } = useServices();
  const { engine: sound, settings, changeSettings } = useSound();
  const { changeSetting } = useTheme();
  const runCommand = useRunCommand();
  useEffect(() => sound.playMusic(musicFor(pathname)), [sound, pathname]);
  const hasBar = showsBar(pathname, game.current !== null);

  // The screen transition reads the direction from the root, after the new screen is in the DOM and before it animates.
  // The game opens as if coming from the start menu.
  const lastPathname = useRef("/");
  useLayoutEffect(() => {
    document.documentElement.dataset.screenDirection = screenDirection(lastPathname.current, pathname);
    lastPathname.current = pathname;
  }, [pathname]);

  const [clock, setClock] = useState<Clock | null>(null);
  const reads = useRef(0);
  const refresh = useCallback(() => {
    const read = ++reads.current;
    if (!game.current) {
      setClock(null);
      return;
    }
    engine.read(["date", "season", "coachClubId"]).then(
      ({ date, season, coachClubId }) => read === reads.current && setClock({ date, season, clubName: coachClubId ? (clubById(coachClubId)?.shortName ?? null) : null }),
      () => read === reads.current && setClock(null),
    );
  }, [engine, game]);
  useEffect(refresh, [refresh, pathname]);

  const title = windowTitle(pathname, clock);
  useEffect(() => {
    document.title = title;
  }, [title]);

  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const say = (text: string, isError = false) => setToast({ id: Date.now(), text, isError });

  async function save() {
    const opened = game.current;
    if (!opened) return;
    try {
      await saveToSlot(engine, slots, opened.slotId, opened);
      say(`Salvo em ${slotLabel(opened.slotId)}.`);
    } catch {
      say("Não deu para salvar.", true);
    }
  }

  // The bar's screens open from wherever the bar shows, and Opções from the start menu too; a live round is never left half-played.
  const isLeavable = pathname !== "/round";
  useCommands({
    ...Object.fromEntries(NAV.map(({ id, path }) => [id, path !== null && (hasBar || (id === "opcoes" && isLeavable)) && (() => navigate(path))])),
    inicio: isLeavable && (() => navigate("/")),
    novoJogo: isLeavable && (() => navigate("/new-game")),
    salvar: hasBar && (() => void save()),
    mudo: () => changeSettings({ ...settings, isMuted: !settings.isMuted }),
    temaClaro: () => changeSetting("light"),
    temaEscuro: () => changeSetting("dark"),
    temaSistema: () => changeSetting("system"),
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = commandForKey(event, PLATFORM);
      if (!command || event.defaultPrevented || (event.key.length === 1 && !event.metaKey && !event.ctrlKey && isTyping(event.target))) return;
      if (runCommand(command)) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [runCommand]);

  const active = navIndexOf(pathname);

  return (
    <GameClockContext value={{ refresh }}>
      <div className="app" data-platform={PLATFORM}>
        {PLATFORM === "mac" && (
          <div className="chrome" data-tauri-drag-region>
            <span className="chrome-title" data-tauri-drag-region>
              {title}
            </span>
          </div>
        )}
        {hasBar && (
          <nav className="bar" aria-label="Telas">
            {NAV.map((item, index) => (
              <BarButton key={item.id} id={item.id} isActive={index === active} />
            ))}
            {clock && (
              <div className="bar-date" data-tauri-drag-region>
                <b>{formatBarDate(clock.date)}</b>
                <span>Temporada {clock.season}</span>
              </div>
            )}
          </nav>
        )}
        <main key={pathname} className="screen">
          <Outlet />
        </main>
        {toast && (
          <p key={toast.id} className={toast.isError ? "toast stk error" : "toast stk"} role="status">
            <i className={toast.isError ? "ph-bold ph-warning" : "ph-bold ph-floppy-disk"} aria-hidden="true" />
            {toast.text}
          </p>
        )}
      </div>
    </GameClockContext>
  );
}

function BarButton({ id, isActive }: { id: NavId; isActive: boolean }) {
  const item = NAV.find((nav) => nav.id === id);
  if (!item) return null;
  const icon = <i className={`${isActive ? "ph-fill" : "ph-bold"} ph-${item.icon}`} aria-hidden="true" />;
  if (!item.path) {
    return (
      <a className="ic off" role="link" aria-disabled="true" title={`${item.label} · em breve`}>
        {icon}
        {item.label}
      </a>
    );
  }
  return (
    <Link to={item.path} className={isActive ? "ic on" : "ic"} aria-current={isActive ? "page" : undefined} title={`${item.label} · ${item.key}`}>
      {isActive ? (
        <span className="ic-plate">
          {icon}
          {item.label}
        </span>
      ) : (
        <>
          {icon}
          {item.label}
        </>
      )}
    </Link>
  );
}
