import { Menu, Submenu, type MenuItemOptions, type PredefinedMenuItemOptions } from "@tauri-apps/api/menu";
import { NAV } from "./screens.js";
import type { CommandId } from "./shortcuts.js";

type Native = PredefinedMenuItemOptions["item"];
export type MenuEntry = { text: string; command: CommandId; accelerator?: string; isEnabled?: boolean } | { native: Native };
export type MenuSection = { text: string; entries: MenuEntry[]; role?: "window" | "help" };

const SEPARATOR: MenuEntry = { native: "Separator" };

/**
 * The macOS menu bar. Every game entry runs the same command as the bar, the keyboard and the screens'
 * buttons; the F-keys and Command-S live here so the menu shows them. The first section is the app menu.
 */
export const MENU: readonly MenuSection[] = [
  {
    text: "Boleiro",
    entries: [
      { native: { About: { name: "Boleiro" } } },
      SEPARATOR,
      { text: "Opções…", command: "opcoes", accelerator: "CmdOrCtrl+Comma" },
      SEPARATOR,
      { native: "Services" },
      SEPARATOR,
      { native: "Hide" },
      { native: "HideOthers" },
      { native: "ShowAll" },
      SEPARATOR,
      { native: "Quit" },
    ],
  },
  {
    text: "Jogo",
    entries: [
      { text: "Novo jogo", command: "novoJogo", accelerator: "CmdOrCtrl+N" },
      { text: "Menu inicial", command: "inicio" },
      SEPARATOR,
      { text: "Salvar", command: "salvar", accelerator: "CmdOrCtrl+S" },
      SEPARATOR,
      { text: "Jogar rodada", command: "jogarRodada", accelerator: "CmdOrCtrl+Enter" },
    ],
  },
  {
    text: "Editar",
    entries: [{ native: "Undo" }, { native: "Redo" }, SEPARATOR, { native: "Cut" }, { native: "Copy" }, { native: "Paste" }, { native: "SelectAll" }],
  },
  {
    text: "Visualizar",
    entries: [
      ...NAV.map(({ id, label, key, path }): MenuEntry => ({ text: label, command: id, accelerator: key, isEnabled: path !== null })),
      SEPARATOR,
      { text: "Tema claro", command: "temaClaro" },
      { text: "Tema escuro", command: "temaEscuro" },
      { text: "Tema do sistema", command: "temaSistema" },
      SEPARATOR,
      { text: "Sem som", command: "mudo" },
      { native: "Fullscreen" },
    ],
  },
  {
    text: "Janela",
    role: "window",
    entries: [{ native: "Minimize" }, { native: "Maximize" }, SEPARATOR, { native: "BringAllToFront" }, { native: "CloseWindow" }],
  },
  { text: "Ajuda", role: "help", entries: [{ text: "Atalhos do teclado", command: "opcoes" }] },
];

function itemOf(entry: MenuEntry, run: (id: CommandId) => void): MenuItemOptions | PredefinedMenuItemOptions {
  if ("native" in entry) return { item: entry.native };
  return { text: entry.text, accelerator: entry.accelerator, enabled: entry.isEnabled ?? true, action: () => run(entry.command) };
}

/** Builds the menu bar and makes it the app's; macOS only, where the menu bar lives outside the window. */
export async function installNativeMenu(run: (id: CommandId) => void): Promise<void> {
  const sections = await Promise.all(
    MENU.map(async ({ text, entries, role }) => {
      const submenu = await Submenu.new({ text, items: entries.map((entry) => itemOf(entry, run)) });
      if (role === "window") await submenu.setAsWindowsMenuForNSApp();
      if (role === "help") await submenu.setAsHelpMenuForNSApp();
      return submenu;
    }),
  );
  const menu = await Menu.new({ items: sections });
  await menu.setAsAppMenu();
}
