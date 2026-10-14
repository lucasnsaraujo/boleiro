import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadThemeSetting, resolveTheme, saveThemeSetting, type ThemeSetting } from "./themeSetting.js";

type ThemeContextValue = { setting: ThemeSetting; changeSetting: (setting: ThemeSetting) => void };

// Outside a provider (a screen tested on its own) the paper follows the system and stays put.
const ThemeContext = createContext<ThemeContextValue>({ setting: "system", changeSetting: () => undefined });

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

function isSystemDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(SYSTEM_DARK).matches;
}

/**
 * Prints the game on cream or night-green paper: `data-theme` on the root switches album.css, and in
 * the desktop app the window's own title bar follows the same choice.
 */
export function ThemeProvider({ store, children }: { store: Pick<Storage, "getItem" | "setItem">; children: ReactNode }) {
  const [setting, setSetting] = useState(() => loadThemeSetting(store));
  const [systemDark, setSystemDark] = useState(isSystemDark);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(SYSTEM_DARK);
    const follow = () => setSystemDark(query.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  // Before the first paint: the window's own background is cream, so a later effect flashes it at dark players.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(setting, systemDark);
  }, [setting, systemDark]);

  useEffect(() => {
    if (isTauri()) void getCurrentWindow().setTheme(setting === "system" ? null : setting);
  }, [setting]);

  function changeSetting(next: ThemeSetting) {
    setSetting(next);
    saveThemeSetting(store, next);
  }

  return <ThemeContext value={{ setting, changeSetting }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
