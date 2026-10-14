import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MusicTrack } from "./soundCatalog.js";
import { SILENT_SOUND, type SoundEngine } from "./soundEngine.js";
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings, type SoundSettings } from "./soundSettings.js";

type Sound = { engine: SoundEngine; settings: SoundSettings; changeSettings: (next: SoundSettings) => void };

/** Without a provider (as in most screen tests) the game is silent. */
const SoundContext = createContext<Sound>({ engine: SILENT_SOUND, settings: DEFAULT_SOUND, changeSettings: () => undefined });

export const useSound = (): Sound => useContext(SoundContext);

const MENU_PATHS = new Set(["/", "/new-game", "/options"]);
const SILENT_PATHS = new Set(["/round", "/season-end", "/sacked"]);

/** The music under a screen: the theme on the menus, quiet music around the club, and none where the moment has its own sound. */
export function musicFor(pathname: string): MusicTrack | null {
  if (MENU_PATHS.has(pathname)) return "menu";
  return SILENT_PATHS.has(pathname) ? null : "hub";
}

const CLICKABLE = "button, a[href], [role='tab']";

/** Loads and saves the sound settings, starts the audio on the first gesture, and clicks under every button. */
export function SoundProvider({ engine, store, children }: { engine: SoundEngine; store: Pick<Storage, "getItem" | "setItem">; children: ReactNode }) {
  const [settings, setSettings] = useState(() => loadSoundSettings(store));

  useEffect(() => engine.apply(settings), [engine, settings]);

  useEffect(() => {
    const unlock = () => engine.unlock();
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
      if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
      // The main action of a screen confirms; every other button clicks.
      engine.play(target.matches(".btn-main, .btn.go, .btn.y") ? "confirm" : "click");
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", click, true);
    };
  }, [engine]);

  function changeSettings(next: SoundSettings) {
    setSettings(next);
    saveSoundSettings(store, next);
  }

  return <SoundContext value={{ engine, settings, changeSettings }}>{children}</SoundContext>;
}
