import { expect, test } from "vitest";
import { MENU, type MenuEntry } from "./nativeMenu.js";
import { commandForKey } from "./shortcuts.js";

const section = (text: string) => MENU.find((s) => s.text === text)?.entries ?? [];
const commands = (entries: MenuEntry[]) => entries.flatMap((entry) => ("command" in entry ? [entry] : []));

test("the menu bar has the game's menus after the app menu", () => {
  expect(MENU.map((s) => s.text)).toEqual(["Boleiro", "Jogo", "Editar", "Visualizar", "Janela", "Ajuda"]);
});

test("Visualizar opens every bar screen on the same F-key as the keyboard, each one enabled now that it has its screen", () => {
  const screens = commands(section("Visualizar")).filter((entry) => entry.accelerator?.startsWith("F"));
  expect(screens.map((entry) => entry.text)).toEqual(["Agenda", "Tabelas", "Estádio", "Base", "Times", "Busca", "Técnicos", "Histórico", "Opções"]);
  for (const entry of screens) {
    const key = { key: entry.accelerator ?? "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    expect(commandForKey(key, "mac")).toBe(entry.command);
  }
  expect(screens.filter((entry) => entry.isEnabled === false).map((entry) => entry.text)).toEqual([]);
});

test("Jogo saves, plays the round and starts a new game", () => {
  expect(commands(section("Jogo")).map(({ text, command, accelerator }) => [text, command, accelerator])).toEqual([
    ["Novo jogo", "novoJogo", "CmdOrCtrl+N"],
    ["Menu inicial", "inicio", undefined],
    ["Salvar", "salvar", "CmdOrCtrl+S"],
    ["Jogar rodada", "jogarRodada", "CmdOrCtrl+Enter"],
  ]);
});

test("Editar keeps the system's copy and paste, which text fields need once the menu is replaced", () => {
  expect(section("Editar")).toEqual(expect.arrayContaining([{ native: "Copy" }, { native: "Paste" }, { native: "Undo" }, { native: "SelectAll" }]));
});
