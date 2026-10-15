import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import type { MarketClockView } from "@boleiro/game-client/market/marketClock";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel } from "@boleiro/game-client/saves/slotMeta";
import { clubById } from "../clubs/clubCatalog.js";
import { musicFor, useSound } from "../sound/SoundProvider.js";
import { useTheme } from "../theme/ThemeProvider.js";
import { useCommands, useIsCommandAnswered, useRunCommand } from "./AppCommands.js";
import { GameClockContext } from "./gameClock.js";
import { installNativeMenu, MENU } from "./nativeMenu.js";
import { hasMica, platformOf, windowChrome, windowsVersion } from "./platform.js";
import { screenDirection } from "./screenDirection.js";
import { NAV, navIndexOf, showsBar, type NavId } from "./screens.js";
import { useServices } from "./ServicesContext.js";
import { commandForKey, MATCH_COMMAND_IDS, type CommandId } from "./shortcuts.js";
import { useAskBeforeDiscarding } from "./useAskBeforeDiscarding.js";
import { isTyping } from "./useTypedWord.js";
import "./shell.css";

type Clock = Pick<GameState, "date" | "season"> & { clubName: string | null; coachName: string | null };
type Toast = { id: number; text: string; isError: boolean };

const PLATFORM = platformOf(navigator.userAgent);
const CHROME = windowChrome(PLATFORM, isTauri(), import.meta.env.DEV ? location.search : "");
const TOAST_MS = 2600;
// The menu bar belongs to the app, not to a screen: it is built once, the first time the shell mounts.
let hasNativeMenu = false;

/** Whether a dialog is up (a confirm, a sheet, the newspaper): the game's shortcuts wait until it closes, Escape closes it. */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

// On a Mac the menu's key equivalents take the F-keys and Command-S before the page sees them; clicked, entries without one still run under a dialog.
const MENU_SHORTCUT_IDS: ReadonlySet<CommandId> = new Set(MENU.flatMap(({ entries }) => entries.flatMap((entry) => ("command" in entry && entry.accelerator ? [entry.command] : []))));

function windowTitle(pathname: string, clock: Clock | null): string {
  if (pathname === "/new-game") return "Boleiro · Nova carreira";
  if (!clock || pathname === "/") return "Boleiro";
  return `Boleiro · ${clock.clubName ?? "Sem clube"} ${clock.season}`;
}

/** The player's page the screen shows, when it shows one. */
function playerOnScreen(pathname: string): string | undefined {
  return pathname.startsWith("/squad/") ? decodeURIComponent(pathname.slice("/squad/".length)) : undefined;
}

/** Whether the screen spends the market clock: the market's search and a player's page (the session leaves the coach's own players out); his offers tab is selling. */
function spendsMarketTime(pathname: string, search: string): boolean {
  if (pathname === "/market") return new URLSearchParams(search).get("aba") !== "propostas";
  return playerOnScreen(pathname) !== undefined;
}

/** The clock's time left as m:ss. */
function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Shell() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { engine, slots, game } = useServices();
  const { engine: sound, settings, changeSettings } = useSound();
  const { changeSetting } = useTheme();
  const runCommand = useRunCommand();
  const isCommandAnswered = useIsCommandAnswered();
  const { askBeforeDiscarding, question } = useAskBeforeDiscarding();
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
  const [marketClock, setMarketClock] = useState<MarketClockView | null>(null);
  const reads = useRef(0);
  const refresh = useCallback(() => {
    const read = ++reads.current;
    if (!game.current) {
      setClock(null);
      return;
    }
    Promise.all([engine.read(["date", "season", "coachClubId", "coachName"]), engine.marketClock()]).then(
      ([{ date, season, coachClubId, coachName }, market]) => {
        if (read !== reads.current) return;
        setClock({ date, season, clubName: coachClubId ? (clubById(coachClubId)?.shortName ?? null) : null, coachName: coachName ?? null });
        setMarketClock(market);
      },
      () => read === reads.current && setClock(null),
    );
  }, [engine, game]);
  useEffect(refresh, [refresh, pathname]);

  // The market clock runs a second at a time while the coach is on a market screen, until it runs out.
  const isClockRunning = hasBar && spendsMarketTime(pathname, search) && (marketClock?.leftSeconds ?? 0) > 0;
  useEffect(() => {
    if (!isClockRunning) return;
    const playerId = playerOnScreen(pathname);
    const tick = setInterval(() => {
      engine.apply({ type: "spendMarketTime", seconds: 1, ...(playerId ? { playerId } : {}) }).then(setMarketClock, () => undefined);
    }, 1000);
    return () => clearInterval(tick);
  }, [engine, isClockRunning, pathname]);

  const title = windowTitle(pathname, clock);
  useEffect(() => {
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title);
  }, [title]);

  // In full screen macOS hides the traffic lights, so the header stops keeping room for them.
  const [isFullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const check = () => void getCurrentWindow().isFullscreen().then(setFullScreen);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [isMicaOn, setMicaOn] = useState(false);
  useEffect(() => {
    if (CHROME === "windows") void windowsVersion().then((version) => setMicaOn(hasMica(version)));
  }, []);

  useEffect(() => {
    if (hasNativeMenu || !isTauri() || PLATFORM !== "mac") return;
    hasNativeMenu = true;
    void installNativeMenu((id) => (MENU_SHORTCUT_IDS.has(id) && isDialogOpen()) || runCommand(id));
  }, [runCommand]);

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
    novoJogo: isLeavable && (() => askBeforeDiscarding(() => navigate("/new-game"))),
    salvar: hasBar && (() => void save()),
    mudo: () => changeSettings({ ...settings, isMuted: !settings.isMuted }),
    temaClaro: () => changeSetting("light"),
    temaEscuro: () => changeSetting("dark"),
    temaSistema: () => changeSetting("system"),
  });

  useEffect(() => {
    // A control the coach reached with Tab, where Space presses it as keyboard users expect. A click focuses a control too,
    // and Chromium then calls it :focus-visible on the next key, so that test alone would let Space re-press the last click.
    let isTabbing = false;
    let tabbedTo: EventTarget | null = null;
    const onFocus = (event: FocusEvent) => {
      tabbedTo = isTabbing ? event.target : null;
    };
    const onPointer = () => {
      isTabbing = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") isTabbing = true;
      const command = commandForKey(event, PLATFORM);
      if (!command || event.defaultPrevented || (event.key.length === 1 && !event.metaKey && !event.ctrlKey && isTyping(event.target))) return;
      if (event.key === " " && event.target === tabbedTo) return;
      const isMatchKey = MATCH_COMMAND_IDS.some((id) => id === command);
      if (isDialogOpen()) {
        if (!isMatchKey) event.preventDefault();
        return;
      }
      // Holding a match key runs it once, but its repeats stay off the page too: Space would press the focused button on release and scroll the board.
      if (isMatchKey && event.repeat) {
        if (isCommandAnswered(command)) event.preventDefault();
        return;
      }
      // WebView2 keeps the browser's own F-keys (F5 reloads the app, F3 finds), so a game key never reaches them even
      // when no screen takes it; only the match keys (Space, digits) stay the page's off the round.
      if (runCommand(command) || !isMatchKey) event.preventDefault();
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [runCommand, isCommandAnswered]);

  const active = navIndexOf(pathname);
  const chrome = isFullScreen ? "none" : CHROME;

  return (
    <GameClockContext value={{ refresh }}>
      <div className="app" data-chrome={chrome} data-mica={isMicaOn || undefined}>
        {hasBar && (
          <nav className="bar" aria-label="Telas" data-tauri-drag-region>
            {NAV.map((item, index) => (
              <BarButton key={item.id} id={item.id} isActive={index === active} />
            ))}
            {marketClock && (
              <div
                className={marketClock.leftSeconds === 0 ? "bar-clock out" : isClockRunning ? "bar-clock running" : "bar-clock"}
                role="timer"
                aria-label={`Relógio do mercado: ${formatClock(marketClock.leftSeconds)}`}
                title={marketClock.leftSeconds === 0 ? "Seu tempo de mercado acabou nesta janela" : "Seu tempo nas telas de compra nesta janela"}
                data-tauri-drag-region
              >
                <i className="ph-bold ph-timer" aria-hidden="true" />
                <b>{formatClock(marketClock.leftSeconds)}</b>
                <span>{clock?.coachName ? `Mercado · ${clock.coachName}` : "Mercado"}</span>
              </div>
            )}
            {clock && (
              <div className={marketClock ? "bar-date beside-clock" : "bar-date"} data-tauri-drag-region>
                <b>{formatBarDate(clock.date)}</b>
                <span>Temporada {clock.season}</span>
              </div>
            )}
          </nav>
        )}
        <main key={pathname} className="screen">
          <div className="drag-edge" data-tauri-drag-region />
          <Outlet />
        </main>
        {chrome === "windows" && <CaptionButtons />}
        {question}
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

/**
 * Windows draws no title bar for the game (`decorations: false` in tauri.windows.conf.json): these are
 * its minimise, maximise and close buttons, sitting in the game's own header at the top right. Windows
 * 11 opens its snap layouts flyout only over a button the window reports as HTMAXBUTTON, which a web
 * page can't, so hovering this one shows none.
 */
function CaptionButtons() {
  const act = (action: "minimize" | "toggleMaximize" | "close") => {
    if (isTauri()) void getCurrentWindow()[action]();
  };
  return (
    <div className="captions">
      <button className="caption" aria-label="Minimizar" onClick={() => act("minimize")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5.5h10" stroke="currentColor" />
        </svg>
      </button>
      <button className="caption" aria-label="Maximizar" onClick={() => act("toggleMaximize")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button className="caption close" aria-label="Fechar" onClick={() => act("close")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" />
        </svg>
      </button>
    </div>
  );
}

function BarButton({ id, isActive }: { id: NavId; isActive: boolean }) {
  const item = NAV.find((nav) => nav.id === id);
  if (!item) return null;
  const icon = <i className={`${isActive ? "ph-fill" : "ph-bold"} ph-${item.icon}`} aria-hidden="true" />;
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
