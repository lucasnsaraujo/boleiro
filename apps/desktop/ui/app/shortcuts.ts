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

/** The keys of a command as the shortcut sheet prints them, or none when it has no key. */
export function shortcutKeys(command: CommandId, platform: Platform): string[] {
  if (command === "salvar") return [platform === "mac" ? "⌘" : "Ctrl", "S"];
  const nav = NAV.find(({ id }) => id === command);
  if (nav) return [nav.key];
  const letter = [...LETTERS].find(([, id]) => id === command)?.[0];
  return letter ? [KEY_NAMES.get(letter) ?? letter.toUpperCase()] : [];
}
