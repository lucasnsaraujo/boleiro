/** The paper the game is printed on: cream, night green, or whatever the system uses. */
export type ThemeSetting = "light" | "dark" | "system";
export type Theme = Exclude<ThemeSetting, "system">;

export const THEME_SETTINGS: readonly ThemeSetting[] = ["light", "dark", "system"];

const KEY = "boleiro.theme";

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadThemeSetting(store: Store): ThemeSetting {
  const saved = store.getItem(KEY);
  return THEME_SETTINGS.find((setting) => setting === saved) ?? "system";
}

export function saveThemeSetting(store: Store, setting: ThemeSetting): void {
  try {
    store.setItem(KEY, setting);
  } catch {
    return;
  }
}

export function resolveTheme(setting: ThemeSetting, isSystemDark: boolean): Theme {
  if (setting !== "system") return setting;
  return isSystemDark ? "dark" : "light";
}
