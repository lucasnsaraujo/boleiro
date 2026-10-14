import { expect, test } from "vitest";
import { loadThemeSetting, resolveTheme, saveThemeSetting } from "./themeSetting.js";

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

test("a fresh install follows the system theme", () => {
  expect(loadThemeSetting(memoryStore())).toBe("system");
});

test("a chosen theme survives a reload, and anything unknown falls back to the system", () => {
  const store = memoryStore();
  saveThemeSetting(store, "dark");
  expect(loadThemeSetting(store)).toBe("dark");
  expect(loadThemeSetting(memoryStore({ "boleiro.theme": "sepia" }))).toBe("system");
});

test("following the system takes the system's choice; a chosen theme ignores it", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});
