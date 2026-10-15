import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import tokens from "@boleiro/design-tokens/tokens.json";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
 * the desktop app the window's own title bar and background follow the same choice.
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

  const theme = resolveTheme(setting, systemDark);

  // Before the first paint: the window's own background is cream, so a later effect flashes it at dark players.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Growing the window shows the native background until the page repaints the new area.
  useEffect(() => {
    if (isTauri()) void getCurrentWebviewWindow().setBackgroundColor(tokens.color[theme].paper);
  }, [theme]);

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
