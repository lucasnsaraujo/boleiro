import type { Platform } from "./platform.js";
import { NAV, type NavId } from "./screens.js";

/** What only the live round answers: the page keeps these keys (Space scrolls, digits type) on every other screen. */
export const MATCH_COMMAND_IDS = ["pausar", "velocidade1", "velocidade2", "velocidade3", "tabelaAoVivo"] as const;

/** Everything the bar, the keyboard and the native menu can ask the game to do. */
export const COMMAND_IDS = [
  ...NAV.map(({ id }) => id),
  "inicio",
  "novoJogo",
  "salvar",
  "jogarRodada",
  "mudo",
  "temaClaro",
  "temaEscuro",
  "temaSistema",
  ...MATCH_COMMAND_IDS,
] as const satisfies readonly string[];

export type CommandId = (typeof COMMAND_IDS)[number];

type Key = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

const F_KEYS: ReadonlyMap<string, NavId> = new Map(NAV.map(({ key, id }) => [key, id]));
const LETTERS: ReadonlyMap<string, CommandId> = new Map([
  ["e", "jogarRodada"],
  ["m", "mudo"],
  [" ", "pausar"],
  ["1", "velocidade1"],
  ["2", "velocidade2"],
  ["3", "velocidade3"],
  ["t", "tabelaAoVivo"],
]);
const KEY_NAMES: ReadonlyMap<string, string> = new Map([[" ", "Espaço"]]);

/** The command a key press asks for: an F-key, a bare letter, digit or Space, or the platform's save chord. */
export function commandForKey(event: Key, platform: Platform): CommandId | null {
  const fKey = F_KEYS.get(event.key);
  if (fKey) return fKey;
  const modifier = platform === "mac" ? event.metaKey : event.ctrlKey;
  const other = platform === "mac" ? event.ctrlKey : event.metaKey;
  const letter = event.key.toLowerCase();
  if (modifier && !other && !event.altKey && letter === "s") return "salvar";
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return LETTERS.get(letter) ?? null;
}

// WebView2's browser keys (wry's browser_accelerator_keys, which Tauri 2.12 leaves on): Ctrl with these letters reloads,
// prints or finds, Alt with an arrow goes back or forward in the page's history.
const BROWSER_CTRL_LETTERS: ReadonlySet<string> = new Set(["r", "p", "f", "g"]);
const BROWSER_KEYS: ReadonlySet<string> = new Set(["BrowserBack", "BrowserForward", "BrowserRefresh", "BrowserSearch", "BrowserHome", "BrowserStop", "BrowserFavorites"]);

/**
 * Whether a key press is one the Windows web view would take as a browser's (reload the app and lose unsaved play,
 * print, find, step back through screens): the game isn't a browser, so these never reach it. The F-keys among
 * them are the game's own, Ctrl+C, Ctrl+V, Ctrl+A and Ctrl+Z still edit, and the dev tools' keys open nothing
 * outside dev builds. A Mac's web view has none.
 */
export function isBrowserChord(event: Key, platform: Platform): boolean {
  if (platform === "mac") return false;
  if (BROWSER_KEYS.has(event.key)) return true;
  if (event.altKey && !event.ctrlKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return true;
  return event.ctrlKey && !event.altKey && !event.metaKey && BROWSER_CTRL_LETTERS.has(event.key.toLowerCase());
}

/** The keys of a command as the shortcut sheet prints them, or none when it has no key. */
export function shortcutKeys(command: CommandId, platform: Platform): string[] {
  if (command === "salvar") return [platform === "mac" ? "⌘" : "Ctrl", "S"];
  const nav = NAV.find(({ id }) => id === command);
  if (nav) return [nav.key];
  const letter = [...LETTERS].find(([, id]) => id === command)?.[0];
  return letter ? [KEY_NAMES.get(letter) ?? letter.toUpperCase()] : [];
}
